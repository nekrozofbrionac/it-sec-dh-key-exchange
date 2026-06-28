import html
import logging
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


HOST = "127.0.0.1"
PORT = 3000
TEMPLATE_PATH = Path(__file__).with_name("index.html")

parties = []
public_log = []

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")


def log_section(title):
    logging.info("")
    logging.info("=" * 72)
    logging.info(title)
    logging.info("=" * 72)


def find_party(name):
    return next((p for p in parties if p["name"] == name), None)

# Add a message to the log of a party or the public log. The message is a dictionary 
def add_message(log, sender, target, kind, payload):
    log.append({"from": sender, "target": target, "type": kind, "payload": payload})

# Add a note to the log of a party. (no target, no sender)
def add_party_note(name, payload):
    add_message(find_party(name)["log"], name, name, "note", payload)

# Connect a new component/party to the public channel. The name must be unique and non-empty.
def connect(name):
    name = name.strip()
    if not name:
        raise ValueError("Name fehlt")
    if find_party(name):
        raise ValueError(f"{name} existiert schon")

    parties.append({"name": name, "known": set(), "log": []})
    log_section("[CONNECT] Verbindungsaufbau")
    logging.info("  %s verbindet sich mit dem Public Channel", name)
    add_message(public_log, name, None, "connect", "Recipient joins")
    add_message(find_party(name)["log"], None, name, "connectResponse", "Connected to Public Channel")


def ping(sender_name):
    sender = find_party(sender_name)
    if not sender:
        raise ValueError("Unbekannter Partner")

    # Ping ist hier der vereinfachte Verbindungsaufbau: alle lernen einander kennen.
    log_section("[PING] Verbindungsaufbau / Teilnehmer finden")
    logging.info("  %s sendet einen Broadcast-Ping", sender_name)
    add_message(public_log, sender_name, None, "ping", "ping")
    add_message(sender["log"], sender_name, None, "ping", "ping")

    for receiver in parties:
        if receiver["name"] == sender_name:
            continue
        sender["known"].add(receiver["name"])
        receiver["known"].add(sender_name)
        logging.info("  %s antwortet %s", receiver["name"], sender_name)
        add_message(receiver["log"], sender_name, receiver["name"], "ping", "ping")
        add_message(receiver["log"], receiver["name"], sender_name, "pong", "pong")
        add_message(sender["log"], receiver["name"], sender_name, "pong", "pong")


def group_dh(initiator_name, group_id, generator, prime):
    initiator = find_party(initiator_name)
    if not initiator:
        raise ValueError("Unbekannter Partner")

    names = sorted({initiator_name, *initiator["known"]})
    if len(names) < 3:
        raise ValueError("DH braucht mindestens 3 verbundene Parteien")

    log_section(f"[DH] Gruppen-Diffie-Hellman, Gruppe {group_id}")
    logging.info("  Teilnehmer: %s", ", ".join(names))
    logging.info("  Oeffentlich sichtbar: generator g=%s, prime p=%s", generator, prime)
    add_message(public_log, initiator_name, None, "dh-init", f"Group: {group_id}, Participants: {', '.join(names)}")
    for name in names:
        if name == initiator_name:
            add_message(find_party(name)["log"], name, None, "dh-init", f"Started group {group_id}: {', '.join(names)}")
        else:
            add_message(find_party(name)["log"], initiator_name, name, "dh-init", f"Join group {group_id}: {', '.join(names)}")

    secrets = {name: random.randint(2, prime - 2) for name in names}
    public_keys = {}
    for name in names:
        public_key = pow(generator, secrets[name], prime)
        public_keys[name] = public_key
        logging.info("")
        logging.info("  %s", name)
        logging.info("    geheimer Exponent: %s", secrets[name])
        logging.info("    Public Key: %s^%s mod %s = %s", generator, secrets[name], prime, public_key)
        add_party_note(name, f"DH secret exponent: {secrets[name]}")
        add_party_note(name, f"Initial DH value: {generator}^{secrets[name]} mod {prime} = {public_key}")

    # Echte Gruppen-DH-Idee: jeder Startwert laeuft einmal durch die Runde.
    # Jede andere Partei potenziert weiter; wegen (g^a)^b = g^(a*b) entsteht derselbe Wert.
    final_values = {}
    for start_index, starter in enumerate(names):
        value = public_keys[starter]
        first_receiver = names[(start_index + 1) % len(names)]
        add_message(public_log, starter, first_receiver, "dh-key", f"Group: {group_id}, round {starter}: {value}")
        add_message(find_party(starter)["log"], starter, first_receiver, "dh-key", f"Started round {starter}: {value}")
        logging.info("")
        logging.info("  Kette startet bei %s", starter)
        logging.info("    Startwert: %s^%s mod %s = %s", generator, secrets[starter], prime, value)

        for step in range(1, len(names)):
            receiver = names[(start_index + step) % len(names)]
            previous = names[(start_index + step - 1) % len(names)]
            old_value = value
            value = pow(value, secrets[receiver], prime)
            logging.info("    %s rechnet weiter: %s^%s mod %s = %s", receiver, old_value, secrets[receiver], prime, value)
            add_message(find_party(receiver)["log"], previous, receiver, "dh-key", f"Received value for round {starter}: {old_value}")
            add_party_note(receiver, f"Round {starter}: {old_value}^{secrets[receiver]} mod {prime} = {value}")
            if step < len(names) - 1:
                next_name = names[(start_index + step + 1) % len(names)]
                add_message(public_log, receiver, next_name, "dh-key", f"Group: {group_id}, round {starter}, forwarded: {value}")
                add_message(find_party(receiver)["log"], receiver, next_name, "dh-key", f"Sent value for round {starter}: {value}")

        owner = names[(start_index - 1) % len(names)]
        final_values[owner] = value
        logging.info("    Ergebnis fuer %s: Gruppengeheimnis = %s", owner, value)
        add_party_note(owner, f"Round {starter} complete after {len(names) - 1} steps, shared group secret: {value}")

    shared_secret = next(iter(final_values.values()))
    logging.info("")
    logging.info("  Pruefung: alle berechneten Gruppengeheimnisse = %s", sorted(final_values.values()))
    for name in names:
        logging.info("  %s kennt jetzt das Geheimnis %s", name, shared_secret)
        add_message(find_party(name)["log"], initiator_name, name, "dh-secret-established", f"Group: {group_id}, Status: ok")

    add_message(public_log, initiator_name, None, "dh-secret-established", f"Group: {group_id}, Status: ok")


def mitm(generator, prime):
    if len(parties) < 2:
        raise ValueError("MITM braucht mindestens 2 Parteien")

    names = [p["name"] for p in parties]
    secrets = {name: random.randint(2, prime - 2) for name in names}
    public_keys = {name: pow(generator, secrets[name], prime) for name in names}
    mallory_secrets = {
        (starter, receiver): random.randint(2, prime - 2)
        for starter in names
        for receiver in names
        if starter != receiver
    }
    fake_keys = {
        key: pow(generator, mallory_secrets[key], prime)
        for key in mallory_secrets
    }

    # Mallory ersetzt jeden Wert auf dem Weg zur naechsten Partei.
    log_section("[MITM] Man-in-the-Middle-Angriff")
    logging.info("  Angriff gegen Gruppe: %s", ", ".join(names))
    logging.info("  Oeffentlich sichtbar: generator g=%s, prime p=%s", generator, prime)
    logging.info("")
    logging.info("  Alle Parteien starten normal")
    for name in names:
        next_name = names[(names.index(name) + 1) % len(names)]
        logging.info("    %s: %s^%s mod %s = %s", name, generator, secrets[name], prime, public_keys[name])
        add_party_note(name, f"MITM: DH secret exponent {secrets[name]}")
        add_party_note(name, f"MITM: own Public Key {generator}^{secrets[name]} mod {prime} = {public_keys[name]}")
        add_message(find_party(name)["log"], name, next_name, "dh-key", f"Started round {name}: {public_keys[name]}")
    logging.info("")
    logging.info("  Mallory erzeugt Fake-Werte pro Runde und Empfaenger")
    for starter, receiver in fake_keys:
        logging.info("    Runde %s, Fake fuer %s: %s^%s mod %s = %s", starter, receiver, generator, mallory_secrets[(starter, receiver)], prime, fake_keys[(starter, receiver)])
    logging.info("")
    logging.info("  Ring-Ablauf mit ersetzten Werten")
    for start_index, starter in enumerate(names):
        value = public_keys[starter]
        for step in range(1, len(names)):
            previous = names[(start_index + step - 1) % len(names)]
            receiver = names[(start_index + step) % len(names)]
            fake_value = fake_keys[(starter, receiver)]
            calculated = pow(fake_value, secrets[receiver], prime)

            logging.info("    %s sendet %s an %s; Mallory ersetzt durch %s", previous, value, receiver, fake_value)
            add_message(public_log, previous, receiver, "dh-key", f"Round {starter}: {value}")
            add_message(public_log, "Mallory", receiver, "dh-key", f"Fake for round {starter}: {fake_value}")
            add_message(find_party(receiver)["log"], "Mallory", receiver, "dh-key", f"Received fake value for round {starter}: {fake_value}")

            if step < len(names) - 1:
                next_name = names[(start_index + step + 1) % len(names)]
                add_party_note(receiver, f"MITM round {starter}, intermediate: {fake_value}^{secrets[receiver]} mod {prime} = {calculated}")
                add_message(find_party(receiver)["log"], receiver, next_name, "dh-key", f"Sent value for round {starter}: {calculated}")
                value = calculated
            else:
                mallory_shared = pow(public_keys[receiver], mallory_secrets[(starter, receiver)], prime)
                logging.info("    %s glaubt an Gruppengeheimnis %s; Mallory hat mit %s ebenfalls %s", receiver, calculated, receiver, mallory_shared)
                add_party_note(receiver, f"MITM round {starter}, final step: {fake_value}^{secrets[receiver]} mod {prime} = {calculated}")
                add_party_note(receiver, f"Round {starter} complete after {len(names) - 1} steps, unauthenticated secret: {calculated}")

    for name in names:
        add_message(find_party(name)["log"], "Mallory", name, "dh-secret-established", "All expected rounds processed, peer not authenticated")
    add_message(public_log, "Mallory", None, "note", f"MITM established {len(names)} separate unauthenticated secrets")


def esc(value):
    return html.escape("" if value is None else str(value))


def render_message_rows(tab):
    active = find_party(tab) if tab else None
    messages = active["log"] if active else public_log
    rows = []

    for index, msg in enumerate(messages):
        sender = msg["from"] or "Public Channel"
        target = msg["target"] or "Public Channel"
        if active:
            if msg["from"] == msg["target"]:
                color = "#ffffdd"
                direction = ""
                peer = ""
            elif msg["from"] == active["name"]:
                color = "#eeeeee"
                direction = "Out"
                peer = target
            else:
                color = "#ddffdd"
                direction = "In"
                peer = sender
            first_cells = f"<td>{esc(direction)}</td><td>{esc(peer)}</td>"
        else:
            color = "#f4f4f4" if index % 2 else "#ffffff"
            first_cells = f"<td>{esc(sender)}</td><td>-></td><td>{esc(target)}</td>"
        rows.append(
            f'<tr style="white-space:nowrap;background:{color}">'
            f'{first_cells}<td>{esc(msg["type"])}</td><td style="width:90%">{esc(msg["payload"])}</td></tr>'
        )
    return "\n".join(rows)


def render_page(tab="", error=""):
    next_names = ["Alice", "Bob", "Charlie", "Dave", "Not-Eve", "Frank", "Grace", "Heidi"]
    next_name = next_names[len(parties) % len(next_names)]
    current_group = "1"
    current_generator = "2"
    current_prime = "100043"

    partner_rows = []
    tab_buttons = ['<button name="tab" value="">Public</button>']
    for p in parties:
        known = ", ".join(sorted(p["known"]))
        partner_rows.append(f"""
        <div>
            <div>Partner: {esc(p["name"])}, Knows: {esc(known)}</div>
            <form method="post" action="/ping"><button name="name" value="{esc(p["name"])}">Ping</button></form>
            <button form="dhForm" formaction="/dh" name="initiator" value="{esc(p["name"])}">Start DH</button>
        </div>""")
        tab_buttons.append(f'<button name="tab" value="{esc(p["name"])}">{esc(p["name"])}</button>')

    error_html = f'<div style="color:#a00">{esc(error)}</div>' if error else ""
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    return (
        template
        .replace("{{NEXT_NAME}}", esc(next_name))
        .replace("{{GROUP_ID}}", current_group)
        .replace("{{GENERATOR}}", current_generator)
        .replace("{{PRIME}}", current_prime)
        .replace("{{ERROR}}", error_html)
        .replace("{{PARTNERS}}", "".join(partner_rows))
        .replace("{{TABS}}", "".join(tab_buttons))
        .replace("{{MESSAGES}}", render_message_rows(tab))
    )


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        tab = parse_qs(urlparse(self.path).query).get("tab", [""])[0]
        self.send_html(render_page(tab))

    def do_POST(self):
        try:
            form = self.read_form()
            path = urlparse(self.path).path
            if path == "/party":
                connect(form.get("name", ""))
            elif path == "/ping":
                ping(form.get("name", ""))
            elif path == "/dh":
                group_dh(form["initiator"], int(form["groupId"]), int(form["generator"]), int(form["prime"]))
            elif path == "/mitm":
                mitm(int(form.get("generator", 2)), int(form.get("prime", 100043)))
            elif path == "/reset":
                parties.clear()
                public_log.clear()
                logging.info("[RESET] Demo zurueckgesetzt")
            self.send_html(render_page())
        except Exception as error:
            logging.info("[ERROR] %s", error)
            self.send_html(render_page(error=str(error)))

    def read_form(self):
        length = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(length).decode("utf-8")
        return {key: values[0] for key, values in parse_qs(data).items()}

    def send_html(self, text):
        data = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_):
        pass


logging.info("[SERVER] http://%s:%s", HOST, PORT)
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
