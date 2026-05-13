
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
    public partners: number[] = [];
    public prime: number = 23;
    public generator: number = 5;

    public addPartner(partner: Partner) {
        const publicKey = partner;
        this.partners.push(publicKey);
    }

}


class Partner {
    public readonly name : string;
    private sk: number;
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

}









