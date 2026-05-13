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

  public addPartner(partner: Partner) {
    if (this.secretEstablished) {
      throw new Error("Secret already established, cannot add new partner");
    }
    this.partners.push(partner);
  }


  public establishSecret() {
    if (this.partners.length < 2) {
      this.onEstablishSecretFinished();
    }


    const amountOfPartners: number = this.partners.length;
    // map von runde zu map von partner zu public key
    // je nach runde besteht der public key also aus allen mitgliedern davor
    const roundValues: Map<number, Map<number, number>> = new Map<number, Map<number, number>>();

    // first round: each partner encodes the generator with their secret key and sends it to the next partner
    // second round and following rounds: each partner encodes the received value with their secret key and sends it to the next partner
    for (let round = 0; round < amountOfPartners - 1; round++) {
      let roundValue: Map<string, number> = new Map<string, number>();
      
    }
  }

  public onEstablishSecretFinished() {
    this.secretEstablished = true;
    alert("Secret established between " + this.partners.map(p => p.name).join(", "));
    return;
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
