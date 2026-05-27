function modExp(
  base: number,
  exp: number,
  mod: number
): number {
  let result = 1;
  base = base % mod;
  while (exp > 0) {
    if (exp % 2 === 1) {
      result = (result * base) % mod;
      exp--;
    }
    base = (base * base) % mod;
    exp /= 2;
  }
  return result;
}

type Message = {
  from: string;
  target: null;
  type: "connect";
  payload: Recipient;
} | {
  from: string | null;
  target: string;
  type: "connectResponse";
  payload: Recipient | null;
} | {
  from: string;
  target: null;
  type: "disconnect";
  payload: null;
} | {
  from: string;
  target: string | null;
  type: "ping";
  payload: string;
} | {
  from: string;
  target: string;
  type: "pong";
  payload: string;
} | {
  from: string;
  target: string;
  type: "note";
  payload: string;
} | {
  from: string;
  target: string | null;
  type: "dh-init";
  payload: {
    groupId: number;
    generator: number;
    prime: number;
    participants: string[];
  };
} | {
  from: string;
  target: string;
  type: "dh-response";
  payload: {
    groupId: number;
    generator: number;
    prime: number;
    response: "ok";
  }
} | {
  from: string;
  target: string;
  type: "dh-key";
  payload: {
    groupId: number;
    publicKey: number;
    startingIndex: number;
  }
} | {
  from: string;
  target: string;
  type: "dh-secret-established";
  payload: {
    groupId: number;
    response: "ok";
  };
}

interface Recipient {
  id: string | null;
  msgLog: Message[];

  receiveMsg(message: Message): void;
}

class MsgChannel implements Recipient {
  public readonly id = null;
  public msgLog: Message[] = [];
  public readonly recipients: Map<string, Recipient> = new Map<string, Recipient>();

  public receiveMsg(message: Message) {
    this.msgLog.push(message);
    if (message.type === "connect") {
      const id: string = message.from;
      const recipient: Recipient = message.payload;
      const success = !this.recipients.has(id);
      if (success) {
        this.recipients.set(id, recipient);
      }
      const messageToSend: Message = {
        from: null,
        target: id,
        type: "connectResponse",
        payload: success ? this : null
      }
      this.msgLog.push(messageToSend);
      this.sendMsg(messageToSend)
      return;
    }
    if (message.type === "disconnect") {
      this.recipients.delete(message.from);
    }
    this.sendMsg(message);
  }

  private sendMsg(message: Message) {
    if (message.target === null) {
      this.recipients.forEach((recipient) => {
        if (recipient.id === message.from) {
          return;
        }
        recipient.receiveMsg(message)
      });
    } else {
      this.recipients.get(message.target)?.receiveMsg(message);
    }
  }
}

interface DHKE {
  groupId: number;
  generator: number;
  prime: number;
  secretKey: number;
  participants: string[];
  ownIndex: number;
  participantConfirmations: { [participant: string]: boolean };
  sharedSecret: number | null;
  awareOfSharedSecret: { [participant: string]: boolean };
}

class Partner implements Recipient {
  public readonly id: string;
  public msgLog: Message[] = [];
  public channel: Recipient | null = null;
  public peopleWeKnow: Set<string> = new Set<string>();
  private dhke: Map<number, DHKE> = new Map<number, DHKE>();
  private dhkeParticipantConfirmations: Map<number, { [participant: string]: boolean }> = new Map<number, {
    [participant: string]: boolean
  }>();

  constructor(
    name: string
  ) {
    this.id = name;
  }

  connect(channel: Recipient): void {
    const msg: Message = {
      from: this.id,
      target: null,
      type: "connect",
      payload: this,
    }
    this.msgLog.push(msg);
    channel.receiveMsg(msg);
  }

  disconnect() {
    if (!this.channel) {
      return;
    }
    this.sendMsg({
      from: this.id,
      target: null,
      type: "disconnect",
      payload: null,
    });
    this.channel = null
  }

  ping(target: string | null, payload: string = "ping"): void {
    this.sendMsg({
      from: this.id,
      target,
      type: "ping",
      payload
    });
  }

  initDH(groupId: number, generator: number, prime: number): void {
    const participants = Array.from(this.peopleWeKnow);
    participants.push(this.id);
    const sortedParticipants = participants.slice().sort();
    const ownIndex = sortedParticipants.indexOf(this.id);
    const secretKey = Math.floor(Math.random() * prime) + 1;
    this.dhke.set(groupId, {
      groupId,
      generator,
      prime,
      secretKey,
      participants: sortedParticipants,
      ownIndex,
      participantConfirmations: { [this.id]: true },
      sharedSecret: null,
      awareOfSharedSecret: {},
    });
    this.sendMsg({
      from: this.id,
      target: this.id,
      type: "note",
      payload: `I'm establishing a DHKE, choosing secret key: ${ secretKey }`
    })
    sortedParticipants.forEach(p => {
      if (p === this.id) {
        return;
      }
      this.sendMsg({
        from: this.id,
        target: p,
        type: "dh-init",
        payload: { groupId, generator, prime, participants: sortedParticipants },
      });
    })
  }

  startDhIfReady(groupId: number) {
    const dhke = this.dhke.get(groupId);
    // console.log("startdhifready", this, groupId, dhke);
    if (!dhke) {
      return;
    }
    if (!dhke.participants.every(p => dhke.participantConfirmations[p])) {
      return;
    }
    const nextIndex = (dhke.ownIndex + 1) % dhke.participants.length;

    // first round?
    this.sendMsg({
      from: this.id,
      target: dhke.participants[nextIndex],
      type: "dh-key",
      payload: {
        groupId: dhke.groupId,
        publicKey: modExp(dhke.generator, dhke.secretKey, dhke.prime),
        startingIndex: dhke.ownIndex,
      }
    });
  }

  receiveMsg(message: Message): void {
    if (message.target !== null && message.target !== this.id) {
      console.warn("Received message not intended for this partner, ignoring. Message: ", message);
      return;
    }
    this.msgLog.push(message);
    switch (message.type) {
      case "connectResponse":
        this.channel = message.payload;
        break;
      case "ping":
        this.sendMsg({
          from: this.id,
          target: message.from,
          type: "pong",
          payload: message.payload,
        });
        break;
      case "pong":
        this.peopleWeKnow.add(message.from);
        break;
      case "disconnect":
        this.peopleWeKnow.delete(message.from);
        break;
      case "dh-init":
        const { groupId, generator, prime, participants } = message.payload;
        const secretKey = Math.floor(Math.random() * prime) + 1;
        const ownIndex = participants.indexOf(this.id);
        const participantConfirmations: { [participant: string]: boolean } = {};
        participantConfirmations[this.id] = true;
        participantConfirmations[message.from] = true;

        const preExisting = this.dhkeParticipantConfirmations.get(groupId) || {};
        for (const p in preExisting) {
          participantConfirmations[p] = true;
        }

        this.dhke.set(groupId, {
          groupId,
          generator,
          prime,
          secretKey,
          ownIndex,
          participants,
          participantConfirmations,
          sharedSecret: null,
          awareOfSharedSecret: {}
        });
        this.dhkeParticipantConfirmations.delete(groupId);
        this.sendMsg({
          from: this.id,
          target: this.id,
          type: "note",
          payload: `${ message.from } tries to establish dhke, choosing secret key: ${ secretKey }`
        })
        participants.forEach(p => {
          if (p === this.id) {
            return;
          }
          this.sendMsg({
            from: this.id,
            target: p,
            type: "dh-response",
            payload: {
              groupId,
              generator,
              prime,
              response: "ok",
            }
          });
        });

        this.startDhIfReady(groupId);
        break;
      case "dh-response": {
        const dhke = this.dhke.get(message.payload.groupId);
        if (!dhke) {
          if (!this.dhkeParticipantConfirmations.has(message.payload.groupId)) {
            this.dhkeParticipantConfirmations.set(message.payload.groupId, {});
          }
          this.dhkeParticipantConfirmations.get(message.payload.groupId)![message.from] = true;
          break;
        }
        dhke.participantConfirmations[message.from] = true;
        this.startDhIfReady(message.payload.groupId);
        break;
      }
      case "dh-key": {
        const dhke = this.dhke.get(message.payload.groupId);
        if (!dhke) {
          return;
        }

        // solang own index < 0 ist juckt das doch nicht
        // oder sogar ownindex == starting index

        const nextIndex = (dhke.ownIndex + 1) % dhke.participants.length;
        if (message.payload.startingIndex != nextIndex) {
          // normal case, just calculate the new public key and pass it on
          this.sendMsg({
            from: this.id,
            target: dhke.participants[nextIndex],
            type: "dh-key",
            payload: {
              groupId: dhke.groupId,
              publicKey: modExp(message.payload.publicKey, dhke.secretKey, dhke.prime),
              startingIndex: message.payload.startingIndex,
            }
          })
        } else {
          // we are the initiator and receive the key back, calculate the shared secret and send the final message
          dhke.sharedSecret = modExp(message.payload.publicKey, dhke.secretKey, dhke.prime);
          dhke.awareOfSharedSecret[this.id] = true;
          this.sendMsg({
            from: this.id,
            target: this.id,
            type: "note",
            payload: `Secret established, Shared Secret: ${ dhke.sharedSecret }`
          })
          this.checkIfSecretEstablished(dhke);
          dhke.participants.forEach(p => {
            if (p === this.id) {
              return;
            }
            this.sendMsg({
              from: this.id,
              target: p,
              type: "dh-secret-established",
              payload: {
                groupId: dhke.groupId,
                response: "ok",
              }
            });
          });
        }
        break;
      }
      case "dh-secret-established": {
        const dhke = this.dhke.get(message.payload.groupId);
        if (!dhke) {
          return;
        }
        dhke.awareOfSharedSecret[message.from] = true;
        this.checkIfSecretEstablished(dhke);

        console.log(`Group ${ message.payload.groupId } secret established`);
        break;
      }
    }
  }

  private checkIfSecretEstablished(dhke: DHKE) {
    if (dhke.participants.every(p => dhke.awareOfSharedSecret[p])) {
      this.sendMsg({
        from: this.id,
        target: this.id,
        type: "note",
        payload: "Everyone has the shared secret :)"
      })
    }
  }

  private sendMsg(message: Message): void {
    this.msgLog.push(message);
    if (!this.channel) {
      console.error("Not connected to a channel, cannot send message");
      return;
    }
    if (message.target === this.id) {
      return;
    }
    this.channel.receiveMsg(message);
  }
}

const names: string[] = [
  "Alice", "Bob", "Charlie", "Dave", "Not-Eve", "Frank", "Grace", "Heidi",
  "Ivan", "Judy", "Kian", "Leonie", "Not-Mallory", "Nina", "Oliver", "Peggy",
  "Quentin", "Rupert", "Svenja", "Trent", "Uma", "Victor", "Walter", "Xavier",
  "Yvonne", "Zara", "ThinkOfYourOwnNamesNow"
];

type UiContext = {
  createPartnerNameInput: HTMLInputElement;
  createPartnerButton: HTMLButtonElement;
  dhGroupIdInput: HTMLInputElement;
  dhGeneratorInput: HTMLInputElement;
  dhPrimeInput: HTMLInputElement;
  partnerContainer: HTMLDivElement;
  currentTabContainer: HTMLDivElement;
  currentTab: string | null;
  messageContainer: HTMLDivElement;
}

interface State {
  ui: UiContext;
  channel: MsgChannel;
  partners: Partner[];
}

function setDefaults(s: State) {
  s.ui.createPartnerNameInput.value = names[s.partners.length % names.length];
}

function redrawUi(s: State) {
  s.ui.partnerContainer.innerHTML = "";
  s.partners.forEach((partner) => {
    const partnerDiv = document.createElement("div");
    const partnerInfoDiv = document.createElement("div");
    partnerInfoDiv.innerText = `Partner: ${ partner.id }, Knows: ${ Array.from(partner.peopleWeKnow).join(", ") }`;
    partnerDiv.appendChild(partnerInfoDiv);

    const partnerPingButton = document.createElement("button");
    partnerPingButton.innerText = "Ping";
    partnerPingButton.onclick = () => {
      partner.ping(null, "bruh");
      redrawUi(s);
    };
    partnerDiv.appendChild(partnerPingButton);

    const dhButton = document.createElement("button");
    dhButton.innerText = "Start DH";
    dhButton.onclick = () => {
      const groupId = parseInt(s.ui.dhGroupIdInput.value);
      const generator = parseInt(s.ui.dhGeneratorInput.value);
      const prime = parseInt(s.ui.dhPrimeInput.value);
      if (!isNaN(groupId) && !isNaN(generator) && !isNaN(prime)) {
        partner.initDH(groupId, generator, prime);
      } else {
        alert("Invalid DH parameters");
      }
      redrawUi(s);
    };
    partnerDiv.appendChild(dhButton);
    s.ui.partnerContainer.appendChild(partnerDiv);
  });

  s.ui.currentTabContainer.innerHTML = "";
  const pubBtn = document.createElement("button");
  pubBtn.innerText = "Public";
  pubBtn.onclick = () => {
    s.ui.currentTab = null;
    redrawUi(s);
  };
  s.ui.currentTabContainer.appendChild(pubBtn);

  s.partners.forEach(partner => {
    const tabBtn = document.createElement("button");
    tabBtn.innerText = partner.id;
    tabBtn.onclick = () => {
      s.ui.currentTab = partner.id;
      redrawUi(s);
    };
    s.ui.currentTabContainer.appendChild(tabBtn);
  });

  s.ui.messageContainer.innerHTML = "";
  const table = document.createElement("table");
  table.style.borderSpacing = "0";
  s.ui.messageContainer.appendChild(table);

  if (s.ui.currentTab === null) {
    s.channel.msgLog.slice().reverse().forEach(msg => table.appendChild(createTableRow(msg, undefined)));
  } else {
    const partner = s.partners.find(p => p.id === s.ui.currentTab);
    if (partner) partner.msgLog.forEach(msg => table.appendChild(createTableRow(msg, partner)));
  }
}

function createTableRow(msg: Message, activeTab: Recipient | undefined): HTMLTableRowElement {
  const publicChannelName = "Public Channel";
  const msgTr = document.createElement("tr");
  msgTr.style.whiteSpace = "nowrap";
  msgTr.style.borderRadius = "5px"

  if (activeTab) {
    // ankommen blau
    // schicken grün
    msgTr.style.background = msg.from === activeTab.id
      ? "#ddddff"
      : "#ddffdd";

    if (msg.from == msg.target) {
      msgTr.style.background = "#ffffdd"
    }

    const arrowIn = document.createElement("td");
    arrowIn.innerHTML = msg.from === activeTab.id
      ? "Out"// "<span class=\"material-symbols-outlined\">arrow_left_alt</span>"
      : "In"// "<span class=\"material-symbols-outlined\">arrow_right_alt</span>";
    if (msg.from == msg.target) {
      arrowIn.innerHTML = "";
    }
    arrowIn.style.paddingRight = "1em";
    msgTr.appendChild(arrowIn);

    const targetCell = document.createElement("td");
    targetCell.innerText = msg.from === activeTab.id
      ? (msg.target || publicChannelName)
      : (msg.from || publicChannelName)
    if (msg.from == msg.target) {
      targetCell.innerHTML = "";
    }

    targetCell.style.paddingRight = "1em";
    msgTr.appendChild(targetCell);

  } else {
    const from = document.createElement("td");
    from.innerText = msg.from === null ? publicChannelName : "" + msg.from + "";
    from.style.paddingRight = "1em";
    msgTr.appendChild(from);

    const arrow = document.createElement("td");
    arrow.innerHTML = "->"// "<span class=\"material-symbols-outlined\">arrow_right_alt</span>";
    arrow.style.paddingRight = "1em";
    msgTr.appendChild(arrow);

    const target = document.createElement("td");
    target.innerText = msg.target || "Public Channel";
    target.style.paddingRight = "1em";
    msgTr.appendChild(target);
  }

  const typeTd = document.createElement("td");
  typeTd.innerText = msg.type;
  typeTd.style.paddingRight = "1em";
  msgTr.appendChild(typeTd);

  const payloadTd = document.createElement("td");
  payloadTd.style.width = "90%";

  switch (msg.type) {
    case "ping":
      payloadTd.innerText = msg.payload;
      break;
    case "pong":
      payloadTd.innerText = msg.payload;
      break;
    case "connect":
    case "connectResponse":
      payloadTd.innerText = "Recipient: " + (msg.payload ? msg.payload.id : publicChannelName);
      break;
    case "disconnect":
      payloadTd.innerText = "No payload";
      break;
    case "dh-init":
      payloadTd.innerText = `Group: ${ msg.payload.groupId }, Prime: ${ msg.payload.prime } ${ msg.payload.generator }, Participants: ${ msg.payload.participants.join(", ") }`;
      break;
    case "dh-response":
      payloadTd.innerText = `Group: ${ msg.payload.groupId }, Resp: ${ msg.payload.groupId }`;
      break;
    case "dh-key":
      payloadTd.innerText = `Group: ${ msg.payload.groupId }, PK: ${ msg.payload.publicKey }, StartingIndex: ${ msg.payload.startingIndex }`;
      break;
    case "dh-secret-established":
      payloadTd.innerText = `Group: ${ msg.payload.groupId }, Status: ${ msg.payload.response }`;
      break;
    case "note":
      payloadTd.innerText = msg.payload;
      break;
    default:
      payloadTd.innerText = "Unknown message type";
  }

  msgTr.appendChild(payloadTd);
  return msgTr;
}

document.addEventListener("DOMContentLoaded", () => {
  const uiContext: UiContext = {
    createPartnerNameInput: document.getElementById("createPartnerName") as HTMLInputElement,
    createPartnerButton: document.getElementById("createPartner") as HTMLButtonElement,
    dhGroupIdInput: document.getElementById("dhGroupId") as HTMLInputElement,
    dhGeneratorInput: document.getElementById("dhGenerator") as HTMLInputElement,
    dhPrimeInput: document.getElementById("dhPrime") as HTMLInputElement,
    partnerContainer: document.getElementById("partnerContainer") as HTMLDivElement,
    currentTabContainer: document.getElementById("currentTabContainer") as HTMLDivElement,
    currentTab: null,
    messageContainer: document.getElementById("messageContainer") as HTMLDivElement,
  };
  const state: State = { ui: uiContext, channel: new MsgChannel(), partners: [] };
  setDefaults(state);
  redrawUi(state);
  state.ui.createPartnerButton.onclick = () => {
    const name = state.ui.createPartnerNameInput.value;
    if (name) {
      const partner = new Partner(name);
      partner.connect(state.channel);
      state.partners.push(partner);
      setDefaults(state);
      redrawUi(state);
    }
  };
});
