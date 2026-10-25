/**
 * A bounded random walk with a pull toward `center`: smooth, realistic-looking metrics.
 */
export class RandomWalk {
  private currentValue: number;

  constructor(
    private readonly center: number,
    private readonly stepSize: number,
    private readonly minimum: number,
    private readonly maximum: number,
  ) {
    this.currentValue = center;
  }

  next(): number {
    const pull = (this.center - this.currentValue) * 0.05;
    const spike = Math.random() < 0.01 ? (Math.random() - 0.3) * this.stepSize * 12 : 0;
    this.currentValue = Math.min(this.maximum, Math.max(this.minimum, this.currentValue + pull + (Math.random() - 0.5) * this.stepSize + spike));
    return this.currentValue;
  }
}
