import { SafetyEventCollector, SafetyJournalWriter } from './qa-private-safety-diagnostics.mjs';

// Native Node events only. Never parse TAP or inspect/forward native text streams.
// The generator yields no stdout and does not invoke any default reporter.
export default async function* reporter(events) {
  yield* []; // Explicit empty output also satisfies the generator lint contract.
  const writer = new SafetyJournalWriter();
  const collector = new SafetyEventCollector(entry => writer.write(entry), process.cwd());
  try {
    for await (const event of events) collector.accept(event);
    collector.finish();
  } catch { collector.error(); }
  finally { writer.close(); }
}
