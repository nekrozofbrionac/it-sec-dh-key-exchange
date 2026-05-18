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
      this.sendMsg({
        from: null,
        target: id,
        type: "connectResponse",
        payload: success ? recipient : null
      })
    }
    if (message.type === "disconnect") {
      this.recipients.delete(message.from);
    }

    this.sendMsg(message);
  }

  private sendMsg(message: Message) {
    this.msgLog.push(message);
    if (message.target === null) {
      // broadcast
      this.recipients.forEach((recipient) => {
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

  private peopleWeKnow: Set<string> = new Set<string>();

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

  ping(target: string, payload: string = "ping"): void {
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

class Channel {
  public readonly partners: OldPartner[] = [];
  public prime: number = 23;
  public generator: number = 5;
  public secretEstablished: boolean = false;
  public publishedMessages: string[] = [];

  constructor(
    generator: number,
    prime: number,
  ) {
    this.generator = generator;
    this.prime = prime;
  }

  public addPartner(partner: OldPartner) {
    if (this.secretEstablished) {
      throw new Error("Secret already established, cannot add new partner");
    }
    this.askToAddPartner(partner)
  }

  public establishSecret() {
    if (this.partners.length < 2) {
      // degenerate case
      this.onEstablishSecretFinished();
    }

    const numberOfPartners: number = this.partners.length;
    // map von runde zu map von partner zu public key
    // je nach runde besteht der public key also aus den beiträgen aller mitgliedern davor
    const allPks: Map<number, Map<number, number>> = new Map<number, Map<number, number>>();

    // first round
    let pksOfFirstRound: Map<number, number> = new Map<number, number>();
    for (let i = 0; i < numberOfPartners; i++) {
      const pkResponse: number = this.askToEncode(i, this.generator, this.prime);
      pksOfFirstRound.set(i, pkResponse);
    }
    allPks.set(0, pksOfFirstRound);

    // 1->n-1 rounds
    for (let round = 1; round < numberOfPartners - 1; round++) {
      let pkOfRound: Map<number, number> = new Map<number, number>();

      for (let i = 0; i < numberOfPartners; i++) {
        const indexOfPrevPartnerPrevRound = (i - 1 + numberOfPartners) % numberOfPartners;
        const pk: number = allPks.get(round - 1)?.get(indexOfPrevPartnerPrevRound)!!; // public key des vorherigen partners aus der vorherigen runde

        const pkResponse: number = this.askToEncode(i, pk, this.prime);
        pkOfRound.set(i, pkResponse);
      }

      allPks.set(round, pkOfRound);
    }

    // last round
    for (let i = 0; i < numberOfPartners; i++) {
      const prevIndex = (i - 1 + numberOfPartners) % numberOfPartners;
      const pk: number = allPks.get(numberOfPartners - 2)?.get(prevIndex) || 1; // public key des vorherigen partners aus der vorherigen runde

      this.askToFinalizeSecret(i, pk, this.prime);
    }

    this.onEstablishSecretFinished();
  }

  public onEstablishSecretFinished() {
    this.secretEstablished = true;
    return;
  }

  public askToAddPartner(partner: OldPartner) {
    // this.publishedMessages.push("Asking to add partner " + partner.name);
    this.partners.push(partner);
    this.publishedMessages.push("Partner " + partner.name + "(" + (this.partners.length - 1) + ") zum Kanal hinzugefügt");

  }

  public askToEncode(recipient: number, base: number, prime: number): number {
    // asking partner i (name) to encode following pk: base, prime
    this.publishedMessages.push("Asking partner " + this.partners[recipient].name + "(" + recipient + ") to encode following base: " + base + " with mod: " + prime);
    const response: number = this.partners[recipient].encode(base, prime);
    this.publishedMessages.push("Partner " + this.partners[recipient].name + "(" + recipient + ") responded with: " + response);
    return response
  }

  public askToFinalizeSecret(recipient: number, base: number, prime: number) {
    this.publishedMessages.push("Asking partner " + this.partners[recipient].name + "(" + recipient + ") to finalize secret with following base: " + base + " with mod: " + prime);
    this.partners[recipient].finalizeSecret(base, prime);
    this.publishedMessages.push("Partner " + this.partners[recipient].name + "(" + recipient + ") finalized secret");
  }
}

class OldPartner {
  public readonly name: string;
  private sk: number;
  private ss: number | undefined; // shared secret

  constructor(
    name: string,
    sk: number
  ) {
    this.name = name;
    this.sk = sk;
  }

  public encode(base: number, prime: number): number {
    return modExp(base, this.sk, prime);
  }

  public finalizeSecret(encodedValue: number, prime: number) {
    this.ss = modExp(encodedValue, this.sk, prime);
  }

  public getAllInfos() {
    return {
      name: this.name,
      sk: this.sk,
      ss: this.ss
    };
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
  createChannelGeneratorInput: HTMLInputElement
  createChannelPrimeInput: HTMLInputElement
  createChannelButton: HTMLButtonElement
  createPartnerNameInput: HTMLInputElement
  createPartnerSkInput: HTMLInputElement
  createPartnerButton: HTMLButtonElement
  establishSecretButton: HTMLButtonElement
  partnerContainer: HTMLDivElement
  channelContainer: HTMLDivElement
  channelMessageContainer: HTMLDivElement
}

const dhdemo: {
  context: {
    channel: Channel | null,
    partners: OldPartner[]
  },
  ui: UiContext
} = {
  context: {
    channel: null,
    partners: []
  },
  ui: null as unknown as UiContext
}

function setPartnerDefaults() {
  const demoPrime = parseInt(dhdemo.ui.createChannelPrimeInput.value);

  dhdemo.ui.createPartnerNameInput.value = names[Math.min(dhdemo.context.partners.length % names.length)];
  dhdemo.ui.createPartnerSkInput.value = Math.floor(Math.random() * demoPrime).toString();
}

function displayChannelInfo() {
  const channel = dhdemo.context.channel
  if (!channel) {
    dhdemo.ui.channelContainer.innerHTML = "Noch kein Kanal erstellt";
    return;
  }
  dhdemo.ui.channelContainer.innerHTML = "Kanal mit generator: " + channel.generator + " und primzahl: " + channel.prime;
}

function displayPartners() {
  const partners = dhdemo.context.partners;
  if (!partners || partners.length === 0) {
    dhdemo.ui.partnerContainer.innerHTML = "Noch niemand";
    return;
  }

  dhdemo.ui.partnerContainer.innerHTML = "";
  partners.forEach((partner, index) => {
    const partnerDiv: HTMLDivElement = document.createElement("div");
    const infos = partner.getAllInfos();
    partnerDiv.innerText = "Partner " + partner.name + "(" + index + ") (sk: " + infos.sk + ", ss: " + infos.ss + ")";
    dhdemo.ui.partnerContainer.appendChild(partnerDiv);
  });
}

function displayChannelMessages() {
  const channel = dhdemo.context.channel;
  dhdemo.ui.channelMessageContainer.innerHTML = "";
  if (!channel || channel.publishedMessages.length === 0) {
    const messageDiv: HTMLDivElement = document.createElement("div");
    messageDiv.className = "channel-message";
    messageDiv.innerText = "Kanal existiert nicht oder wurden keine Nachrichten verschickt.";
    dhdemo.ui.channelMessageContainer.appendChild(messageDiv);
    return;
  }
  channel.publishedMessages.forEach((message) => {
    const messageDiv: HTMLDivElement = document.createElement("div");
    messageDiv.className = "channel-message";
    messageDiv.innerText = message;
    dhdemo.ui.channelMessageContainer.appendChild(messageDiv);
  });
}

function updateUi() {
  if (!dhdemo.context.channel || dhdemo.context.channel.secretEstablished) {
    dhdemo.ui.establishSecretButton.disabled = true;
    dhdemo.ui.createPartnerButton.disabled = true;
  } else {
    dhdemo.ui.establishSecretButton.disabled = false;
    dhdemo.ui.createPartnerButton.disabled = false;
  }

  displayChannelInfo();
  displayPartners();
  displayChannelMessages();
}

document.addEventListener("DOMContentLoaded", () => {
  dhdemo.ui = {
    createChannelGeneratorInput: document.getElementById("createChannelGenerator") as HTMLInputElement,
    createChannelPrimeInput: document.getElementById("createChannelPrime") as HTMLInputElement,
    createChannelButton: document.getElementById("createChannel") as HTMLButtonElement,

    createPartnerNameInput: document.getElementById("createPartnerName") as HTMLInputElement,
    createPartnerSkInput: document.getElementById("createPartnerSk") as HTMLInputElement,
    createPartnerButton: document.getElementById("createPartner") as HTMLButtonElement,

    establishSecretButton: document.getElementById("establishSecret") as HTMLButtonElement,
    channelContainer: document.getElementById("channelContainer") as HTMLDivElement,
    partnerContainer: document.getElementById("partnerContainer") as HTMLDivElement,
    channelMessageContainer: document.getElementById("channelMessageContainer") as HTMLDivElement
  }
  // Asserting that the UI elements are present

  dhdemo.ui.createChannelGeneratorInput.value = "2";
  dhdemo.ui.createChannelPrimeInput.value = "50021";
  setPartnerDefaults();
  updateUi();


  dhdemo.ui.createChannelButton.addEventListener("click", () => {
    const generator: number = parseInt(dhdemo.ui.createChannelGeneratorInput.value);
    const prime: number = parseInt(dhdemo.ui.createChannelPrimeInput.value);

    if (isNaN(generator) || isNaN(prime)) {
      alert("Please enter valid numbers for generator and prime");
      return;
    }

    dhdemo.context.channel = new Channel(generator, prime);
    dhdemo.context.partners = [];
    console.log("Channel created");
    updateUi();
  })

  dhdemo.ui.createPartnerButton.addEventListener("click", () => {
    const name: string = dhdemo.ui.createPartnerNameInput.value;
    const sk: number = parseInt(dhdemo.ui.createPartnerSkInput.value);

    if (!dhdemo.context.channel) {
      alert("Please create a channel first");
      return;
    }
    if (isNaN(sk)) {
      alert("Please enter a valid number for secret key");
      return;
    }

    const partner: OldPartner = new OldPartner(name, sk);
    dhdemo.context.partners.push(partner);
    dhdemo.context.channel.addPartner(partner);
    console.log("Partner " + name + " created");

    setPartnerDefaults();
    updateUi();
  });

  dhdemo.ui.establishSecretButton.addEventListener("click", () => {
    if (!dhdemo.context.channel) {
      alert("Please create a channel first");
      return;
    }

    if (dhdemo.context.partners.length < 2) {
      alert("Please create at least 2 partners to establish a secret");
      return;
    }

    dhdemo.context.channel.establishSecret();
    updateUi();
  });
});

console.log("Fertig geladen");
