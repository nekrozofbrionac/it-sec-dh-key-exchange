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
  payload: Recipient | null; //
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
    // this.msgLog.push(message);
    if (message.target === null) {
      // broadcast
      this.recipients.forEach((recipient) => {
        if (recipient.id === message.from) {
          return;
        }
        recipient.receiveMsg(message)
      });
    } else {
      // direct message
      this.recipients.get(message.target)?.receiveMsg(message);
    }
  }
}

class Partner implements Recipient {
  public readonly id: string;
  public msgLog: Message[] = [];
  public channel: Recipient | null = null;

  public peopleWeKnow: Set<string> = new Set<string>();

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
      target: target,
      type: "ping",
      payload: payload,
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
      default:
        console.log("Received message of type: " + message.type);
        return;
    }
  }

  private sendMsg(message: Message): void {
    if (!this.channel) {
      console.error("Not connected to a channel, cannot send message");
      return;
    }
    this.msgLog.push(message);
    this.channel.receiveMsg(message);
  }
}

const names: string[] = [
  "Alice",
  "Bob",
  "Charlie",
  "Dave",
  "Not-Eve",
  "Frank",
  "Grace",
  "Heidi",
  "Ivan",
  "Judy",
  "Karl",
  "Leo",
  "Not-Mallory",
  "Nina",
  "Oscar",
  "Peggy",
  "Quentin",
  "Rupert",
  "Sybil",
  "Trent",
  "Uma",
  "Victor",
  "Walter",
  "Xavier",
  "Yvonne",
  "Zara",
  "ThinkOfYourOwnNamesNow"
];

type UiContext = {
  createPartnerNameInput: HTMLInputElement
  createPartnerSkInput: HTMLInputElement
  createPartnerButton: HTMLButtonElement
  partnerContainer: HTMLDivElement
  currentTabContainer: HTMLDivElement
  currentTab: string | null
  messageContainer: HTMLDivElement
}

interface State {
  ui: UiContext
  channel: MsgChannel;
  partners: Partner[];
}

function setDefaults(s: State) {
  s.ui.createPartnerNameInput.value = names[s.partners.length % names.length];
  s.ui.createPartnerSkInput.value = (Math.floor(Math.random() * 10000) + 1).toString();
}


function redrawUi(s: State) {
  s.ui.partnerContainer.innerHTML = "";
  s.partners.forEach((partner) => {
    const partnerDiv = document.createElement("div");
    const partnerInfoDiv = document.createElement("div");
    partnerInfoDiv.innerText = "Partner: " + partner.id + ", Knows: " + Array.from(partner.peopleWeKnow).join(", ");
    partnerDiv.appendChild(partnerInfoDiv);
    const partnerPingButton = document.createElement("button");
    partnerPingButton.innerText = "Ping";
    partnerPingButton.addEventListener("click", () => {
      partner.ping(null, "bruh")
      redrawUi(s);
    });
    partnerDiv.appendChild(partnerPingButton);
    s.ui.partnerContainer.appendChild(partnerDiv);
  });


  /* tabs */
  s.ui.currentTabContainer.innerHTML = "";
  const channelTabButton = document.createElement("button");
  channelTabButton.innerText = "Public";
  channelTabButton.addEventListener("click", () => {
    s.ui.currentTab = null;
    redrawUi(s);
  });
  s.ui.currentTabContainer.appendChild(channelTabButton);

  s.partners.forEach((partner) => {
    const partnerTabButton = document.createElement("button");
    partnerTabButton.innerText = partner.id;
    partnerTabButton.addEventListener("click", () => {
      s.ui.currentTab = partner.id;
      redrawUi(s);
    });
    s.ui.currentTabContainer.appendChild(partnerTabButton);
  });


  // show messages of current tab
  s.ui.messageContainer.innerHTML = "";
  const tableElement = document.createElement("table");
  tableElement.style.borderSpacing = "1em 0";
  s.ui.messageContainer.appendChild(tableElement);
  if (s.ui.currentTab === null) {
    s.channel.msgLog.slice().reverse().forEach((msg) => {
      tableElement.appendChild(createTableRow(msg, undefined));
    });
  } else {
    const partner = s.partners.find((p) => p.id === s.ui.currentTab);
    if (partner) {
      partner.msgLog.forEach((msg) => {
        tableElement.appendChild(createTableRow(msg, partner));
      });
    }
  }
}

function createTableRow(msg: Message, recipient: Recipient | undefined): HTMLTableRowElement {
  const publicChanenlName = "Public Channel";
  const msgTr = document.createElement("tr");
  //msgTr.style.display = "flex";
  msgTr.style.whiteSpace = "nowrap";

  if (recipient) {
    const arrowIn = document.createElement("td");
    arrowIn.innerHTML = msg.from === recipient.id
      ? "<span class=\"material-symbols-outlined\">arrow_left_alt</span>"
      : "<span class=\"material-symbols-outlined\">arrow_right_alt</span>";
    msgTr.appendChild(arrowIn);

    const targetDiv = document.createElement("td");
    targetDiv.innerText = msg.from === recipient.id
      ? (msg.target || publicChanenlName)
      : (msg.from || publicChanenlName)
    msgTr.appendChild(targetDiv);


  } else {
    const from = document.createElement("td");
    from.innerText = msg.from === null ? publicChanenlName : "" + msg.from + "";
    msgTr.appendChild(from);

    const arrow = document.createElement("td");
    arrow.innerHTML = "<span class=\"material-symbols-outlined\">arrow_right_alt</span>";
    msgTr.appendChild(arrow);

    const target = document.createElement("td");
    target.innerText = msg.target || "Public Channel";
    msgTr.appendChild(target);
  }

  const typeTd = document.createElement("td");
  typeTd.innerText = msg.type;
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
      payloadTd.innerText = "Recipient: " + (msg.payload ? msg.payload.id : publicChanenlName);
      break;
    case "disconnect":
      payloadTd.innerText = "No payload";
    default:
      payloadTd.innerText = "Unknown message type";
  }

  msgTr.appendChild(payloadTd);
  return msgTr
}

document.addEventListener("DOMContentLoaded", () => {
  const uiContext: UiContext = {
    createPartnerNameInput: document.getElementById("createPartnerName") as HTMLInputElement,
    createPartnerSkInput: document.getElementById("createPartnerSk") as HTMLInputElement,
    createPartnerButton: document.getElementById("createPartner") as HTMLButtonElement,
    partnerContainer: document.getElementById("partnerContainer") as HTMLDivElement,

    currentTabContainer: document.getElementById("currentTabContainer") as HTMLDivElement,
    currentTab: null,

    messageContainer: document.getElementById("messageContainer") as HTMLDivElement,
  }

  const state: State = {
    ui: uiContext,
    channel: new MsgChannel(),
    partners: [],
  }

  setDefaults(state)
  redrawUi(state)

  state.ui.createPartnerButton.addEventListener("click", () => {
    const name = state.ui.createPartnerNameInput.value;
    const sk = parseInt(state.ui.createPartnerSkInput.value);
    if (!name || isNaN(sk)) {
      alert("Please enter a valid name and secret key");
      return;
    }
    const partner = new Partner(name);
    partner.connect(state.channel);
    state.partners.push(partner);
    setDefaults(state);
    redrawUi(state)
  });


});

console.log("Fertig geladen");
