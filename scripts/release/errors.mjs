// scripts/release/errors.mjs
// The one error type the release pipeline throws on purpose. Its message is printed verbatim
// after "release: " as the run's last line, so it is written as an instruction — what is wrong
// and what to do — and kept to a single line: the operator should never have to scroll up
// through npm or Gradle output to find out why the run stopped. Anything that is NOT a
// ReleaseError is a bug in this script and is reported as "unexpected failure".
//
// `final: true` marks a stop that `npm run release -- --resume` cannot get past by itself (the
// GitHub release was made public by someone else, the draft was deleted, state.json is not what
// this script wrote): the publish stage then does not append its "--resume continues" hint.
export class ReleaseError extends Error {
  constructor(message, { final = false } = {}) {
    super(message.replace(/\s*\n\s*/g, ' ').trim())
    this.name = 'ReleaseError'
    this.final = final
  }
}
