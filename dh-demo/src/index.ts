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

class Channel {
  public readonly partners: Partner[] = [];
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

  public addPartner(partner: Partner) {
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

      if (pk === 1) {
        console.log(prevIndex, numberOfPartners, pk)
        console.log(allPks)

      }
      this.askToFinalizeSecret(i, pk, this.prime);
    }

    this.onEstablishSecretFinished();
  }

  public onEstablishSecretFinished() {
    this.secretEstablished = true;
    alert("Secret established between " + this.partners.map(p => p.name).join(", "));
    return;
  }

  public askToAddPartner(partner: Partner) {
    this.publishedMessages.push("Asking to add partner " + partner.name);
    this.partners.push(partner);
    this.publishedMessages.push("Partner " + partner.name + "("+ (this.partners.length-1) + ") added to channel");

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

class Partner {
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

const context: {
  channel: Channel | null,
  partners: Partner[]
} = {
  channel: null,
  partners: [] as Partner[]
}

function displayPartners(partners: Partner[]) {
  const partnerContainer: HTMLDivElement = document.getElementById("partnerContainer") as HTMLDivElement;
  partnerContainer.innerHTML = "";

  partners.forEach((partner, index) => {
    const partnerDiv: HTMLDivElement = document.createElement("div");
    const infos = partner.getAllInfos();
    partnerDiv.innerText = "Partner " + partner.name + "("+ index + ") (sk: " + infos.sk + ", ss: " + infos.ss + ")";
    partnerContainer.appendChild(partnerDiv);
  });
}

function displayChannelMessages(channel: Channel) {
  const channelMessageContainer: HTMLDivElement = document.getElementById("channelMessageContainer") as HTMLDivElement;
  channelMessageContainer.innerHTML = "";

  channel.publishedMessages.forEach((message) => {
    const messageDiv: HTMLDivElement = document.createElement("div");
    messageDiv.className = "channel-message";
    messageDiv.innerText = message;
    channelMessageContainer.appendChild(messageDiv);
  });
}

function getCurrentDefaultName() {
  return names[Math.min(context.partners.length % names.length)];
}

document.addEventListener("DOMContentLoaded", () => {
  const createChannelGeneratorInput: HTMLInputElement = document.getElementById("createChannelGenerator") as HTMLInputElement;
  const createChannelPrimeInput: HTMLInputElement = document.getElementById("createChannelPrime") as HTMLInputElement;
  const createChannelButton: HTMLButtonElement = document.getElementById("createChannel") as HTMLButtonElement;

  const createPartnerNameInput: HTMLInputElement = document.getElementById("createPartnerName") as HTMLInputElement;
  const createPartnerSkInput: HTMLInputElement = document.getElementById("createPartnerSk") as HTMLInputElement;
  const createPartnerButton: HTMLButtonElement = document.getElementById("createPartner") as HTMLButtonElement;

  const establishSecretButton: HTMLButtonElement = document.getElementById("establishSecret") as HTMLButtonElement;

  createChannelGeneratorInput.value = "2";
  createChannelPrimeInput.value = "50021";
  createPartnerNameInput.value = getCurrentDefaultName();


  createChannelButton.addEventListener("click", () => {
    const generator: number = parseInt(createChannelGeneratorInput.value);
    const prime: number = parseInt(createChannelPrimeInput.value);

    if (isNaN(generator) || isNaN(prime)) {
      alert("Please enter valid numbers for generator and prime");
      return;
    }

    context.channel = new Channel(generator, prime);
    console.log("Channel created");
  })

  createPartnerButton.addEventListener("click", () => {
    const name: string = createPartnerNameInput.value;
    const sk: number = parseInt(createPartnerSkInput.value);

    if (isNaN(sk)) {
      alert("Please enter a valid number for secret key");
      return;
    }

    const partner: Partner = new Partner(name, sk);
    context.partners.push(partner);
    console.log("Partner " + name + " created");
    displayPartners(context.partners);
    createPartnerNameInput.value = getCurrentDefaultName();
  });

  establishSecretButton.addEventListener("click", () => {
    if (!context.channel) {
      alert("Please create a channel first");
      return;
    }

    if (context.partners.length < 2) {
      alert("Please create at least 2 partners to establish a secret");
      return;
    }

    for (const partner of context.partners) {
      context.channel.addPartner(partner);
    }

    context.channel.establishSecret();
    displayPartners(context.partners);
    displayChannelMessages(context.channel);
  });

});

console.log("Fertig geladen");
