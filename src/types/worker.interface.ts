export interface ICronWorker<T> {
  name: string;
  run(sender: T): void;
}
