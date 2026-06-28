import html
import logging
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


# EXTENDED VERSION
#
# Difference to app.py:
# - This file models the participants as separate units. The server is mostly a
#   public channel: it sends messages, and each participant reacts in receive().
# - Each participant chooses only its own DH secret in init_dh_session().
# - Each participant computes only when it receives a DH value in handle_dh_key().
# - Mallory is modeled in send(): she can intercept and replace messages in the
#   channel, instead of precomputing the whole attack centrally.
#
# This is still a small teaching demo, not a production protocol, but the backend
# structure is closer to how a distributed protocol would be modeled.

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


def next_participant(name, participants):
    return participants[(participants.index(name) + 1) % len(participants)]


def payload_text(kind, payload):
    if isinstance(payload, str):
        return payload
    if kind == "dh-init":
        return f"Group {payload['group_id']}: {', '.join(payload['participants'])}"
    if kind == "dh-start":
        return f"Start group {payload['group_id']}"
    if kind == "dh-key":
        prefix = "Fake " if payload.get("fake") else ""
        return f"{prefix}value for round {payload['round']}: {payload['value']}"
    return str(payload)


def send(sender, target, kind, payload):
    # Channel function: participants do not write into each other's state
    # directly. They send a message, and the channel delivers it to receive().
    add_message(find_party(sender)["log"], sender, target, kind, payload_text(kind, payload))

    if kind == "dh-key" and payload.get("attack"):
        # MITM happens in the channel: Mallory intercepts a visible DH value,
        # replaces it with her own fake value, and only then the receiver reacts.
        mallory_secret = random.randint(2, payload["prime"] - 2)
        fake_value = pow(payload["generator"], mallory_secret, payload["prime"])
        fake_payload = {**payload, "value": fake_value, "fake": True}

        add_message(public_log, sender, target, kind, payload_text(kind, payload))
        add_message(public_log, "Mallory", target, kind, payload_text(kind, fake_payload))
        logging.info("    Mallory ersetzt %s -> %s durch %s", sender, target, fake_value)
        receive(target, "Mallory", kind, fake_payload)
        return

    add_message(public_log, sender, target, kind, payload_text(kind, payload))
    receive(target, sender, kind, payload)


def receive(receiver_name, sender, kind, payload):
    # Participant function: this is where a single party reacts to a message.
    # In contrast to app.py, the global DH function does not calculate for all.
    receiver = find_party(receiver_name)
    add_message(receiver["log"], sender, receiver_name, kind, payload_text(kind, payload))

    if kind == "ping":
        receiver["known"].add(sender)
        send(receiver_name, sender, "pong", "pong")
    elif kind == "pong":
        receiver["known"].add(sender)
    elif kind == "dh-init":
        init_dh_session(receiver, payload)
    elif kind == "dh-start":
        start_own_dh_round(receiver, payload["group_id"])
    elif kind == "dh-key":
        handle_dh_key(receiver, payload)


def init_dh_session(participant, payload):
    # Local secret selection: only this participant stores this secret.
    # No central secrets dict for all participants is used in this version.
    group_id = payload["group_id"]
    secret = random.randint(2, payload["prime"] - 2)
    participant["sessions"][group_id] = {
        **payload,
        "secret": secret,
        "processed_rounds": set(),
        "status_sent": False,
        "shared_secret": None,
    }
    add_party_note(participant["name"], f"DH secret exponent: {secret}")
    logging.info("  %s waehlt lokal secret=%s", participant["name"], secret)


def start_own_dh_round(participant, group_id):
    # Each participant starts exactly one own round with its own public value.
    session = participant["sessions"][group_id]
    name = participant["name"]
    value = pow(session["generator"], session["secret"], session["prime"])
    target = next_participant(name, session["participants"])

    add_party_note(name, f"Initial DH value: {session['generator']}^{session['secret']} mod {session['prime']} = {value}")
    logging.info("  %s startet Runde %s: %s^%s mod %s = %s", name, name, session["generator"], session["secret"], session["prime"], value)
    send(name, target, "dh-key", {
        "group_id": group_id,
        "participants": session["participants"],
        "generator": session["generator"],
        "prime": session["prime"],
        "round": name,
        "value": value,
        "count": 1,
        "attack": session["attack"],
    })


def handle_dh_key(participant, payload):
    # Local DH step: the participant takes the received public value and raises
    # it to its own private exponent. Then it either forwards or finishes.
    session = participant["sessions"][payload["group_id"]]
    name = participant["name"]
    new_value = pow(payload["value"], session["secret"], session["prime"])
    new_count = payload["count"] + 1

    label = "MITM " if payload.get("fake") else ""
    add_party_note(name, f"{label}round {payload['round']}: {payload['value']}^{session['secret']} mod {session['prime']} = {new_value}")
    logging.info("  %s rechnet Runde %s: %s^%s mod %s = %s", name, payload["round"], payload["value"], session["secret"], session["prime"], new_value)
    session["processed_rounds"].add(payload["round"])

    if new_count < len(session["participants"]):
        send(name, next_participant(name, session["participants"]), "dh-key", {**payload, "value": new_value, "count": new_count, "fake": False})
    else:
        session["shared_secret"] = new_value
        text = "unauthenticated secret" if session["attack"] else "shared group secret"
        add_party_note(name, f"Round {payload['round']} complete after {len(session['participants']) - 1} steps, {text}: {new_value}")
        logging.info("  %s beendet Runde %s mit %s=%s", name, payload["round"], text, new_value)

    expected_incoming_rounds = len(session["participants"]) - 1
    if len(session["processed_rounds"]) == expected_incoming_rounds and not session["status_sent"]:
        status = "All expected rounds processed, peer not authenticated" if session["attack"] else "All expected rounds processed, Status: ok"
        add_message(participant["log"], "Mallory" if session["attack"] else None, name, "dh-secret-established", status)
        session["status_sent"] = True

# Connect a new component/party to the public channel. The name must be unique and non-empty.
def connect(name):
    name = name.strip()
    if not name:
        raise ValueError("Name fehlt")
    if find_party(name):
        raise ValueError(f"{name} existiert schon")

    parties.append({"name": name, "known": set(), "log": [], "sessions": {}})
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
    # implemented as a broadcast to all other parties, except the sender itself
    # in real life, this way depends on the used protocol, e.g. broadcast, multicast, or peer-to-peer discovery
    for receiver in parties:
        if receiver["name"] == sender_name:
            continue
        send(sender_name, receiver["name"], "ping", "ping")


def group_dh(initiator_name, group_id, generator, prime):
    # Only starts the protocol. The actual DH work happens later inside each
    # participant through receive() -> init/start/handle.
    initiator = find_party(initiator_name)
    if not initiator:
        raise ValueError("Unbekannter Partner")

    names = sorted({initiator_name, *initiator["known"]})
    if len(names) < 3:
        raise ValueError("DH braucht mindestens 3 verbundene Parteien")

    log_section(f"[DH] Gruppen-Diffie-Hellman, Gruppe {group_id}")
    logging.info("  Teilnehmer: %s", ", ".join(names))
    logging.info("  Oeffentlich sichtbar: generator g=%s, prime p=%s", generator, prime)
    payload = {
        "group_id": group_id,
        "participants": names,
        "generator": generator,
        "prime": prime,
        "attack": False,
    }

    add_message(public_log, initiator_name, None, "dh-init", payload_text("dh-init", payload))
    for name in names:
        receive(name, initiator_name, "dh-init", payload)

    add_message(public_log, initiator_name, None, "dh-start", payload_text("dh-start", payload))
    for name in names:
        receive(name, initiator_name, "dh-start", payload)


def mitm(generator, prime):
    # Same participant protocol as group_dh(), but with attack=True.
    # The replacement of values is handled by send(), i.e. by the channel.
    if len(parties) < 2:
        raise ValueError("MITM braucht mindestens 2 Parteien")

    names = [p["name"] for p in parties]
    group_id = 999
    payload = {
        "group_id": group_id,
        "participants": names,
        "generator": generator,
        "prime": prime,
        "attack": True,
    }

    log_section("[MITM] Man-in-the-Middle-Angriff")
    logging.info("  Angriff gegen Gruppe: %s", ", ".join(names))
    logging.info("  Oeffentlich sichtbar: generator g=%s, prime p=%s", generator, prime)

    add_message(public_log, names[0], None, "dh-init", payload_text("dh-init", payload))
    for name in names:
        receive(name, names[0], "dh-init", payload)

    add_message(public_log, names[0], None, "dh-start", payload_text("dh-start", payload))
    for name in names:
        receive(name, names[0], "dh-start", payload)


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
