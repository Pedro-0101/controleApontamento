export interface IRelogio {
  numSerie: string;
}

export class Relogio implements IRelogio {
  numSerie: string = '';

  constructor(data: Partial<IRelogio>) {
    Object.assign(this, data);
  }
}