// scripts/release/properties.mjs
// Reads a Java .properties file the way java.util.Properties.load does — which is how Gradle
// reads android/keystore.properties. The release preflight needs one value from it (storeFile)
// to check the keystore exists before a ten-minute build, and it has to see the SAME path Gradle
// will see. The trap is backslashes: in .properties they are escapes, so a Windows path typed as
// `C:\Users\me\keys\x.jks` is read by Java as "C:Usersmekeysx.jks" (and `\t` becomes a tab).
// A naive split on "=" would find the file that Gradle then fails to find.
//
// Covered: # and ! comments, blank lines, `=` / `:` / whitespace separators, line continuations
// (an odd number of trailing backslashes), and the escapes \t \n \r \f \uXXXX \<char>.

function unescape(text) {
  return text.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e) => {
    if (e[0] === 'u' && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16))
    return { t: '\t', n: '\n', r: '\r', f: '\f' }[e] ?? e
  })
}

const endsWithOddBackslashes = (line) => (/\\+$/.exec(line)?.[0].length ?? 0) % 2 === 1

/** The file's text -> Map of key -> value, later keys overriding earlier ones, as Java does. */
export function parseProperties(text) {
  const props = new Map()
  const lines = String(text).split(/\r\n|\r|\n/)
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/^[ \t\f]+/, '')
    if (!line || line[0] === '#' || line[0] === '!') continue
    while (endsWithOddBackslashes(line) && i + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++i].replace(/^[ \t\f]+/, '')
    }
    if (endsWithOddBackslashes(line)) line = line.slice(0, -1)
    // The key ends at the first unescaped separator; `\\.` skips escaped characters.
    const m = /^((?:\\.|[^=:\s\\])*)[ \t\f]*(?:[=:][ \t\f]*)?(.*)$/s.exec(line)
    props.set(unescape(m[1]), unescape(m[2]))
  }
  return props
}
