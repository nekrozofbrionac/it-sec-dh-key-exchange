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
        const prevIndex = (i - 1 + numberOfPartners) % numberOfPartners;
        const pk: number = allPks.get(round - 1)?.get(prevIndex) || 1; // public key des vorherigen partners aus der vorherigen runde

        const pkResponse: number = this.askToEncode(i, pk, this.prime);
        pkOfRound.set(i, pkResponse);
      }

      allPks.set(round, pkOfRound);
    }

    // last round
    for (let i = 0; i < numberOfPartners; i++) {
      const prevIndex = (i - 1 + numberOfPartners) % numberOfPartners;
      const pk: number = allPks.get(numberOfPartners - 1)?.get(prevIndex) || 1; // public key des vorherigen partners aus der vorherigen runde

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
    const response: number = this.partners[0].encode(base, prime);
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
}



console.log("Fertig geladen");
