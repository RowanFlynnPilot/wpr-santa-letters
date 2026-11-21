// Ends a sentence. A business's name can end in a period of its own ("PGA Inc."), and a sentence that
// ends on it takes no second one (AP): "wins a furnace tune-up from PGA Inc." Use it wherever a sponsor's
// name, or a list of them, can be a sentence's last words: the winners' lines, the article's thanks, the
// email to a winner's family. Found in a dress rehearsal on Nov. 21 with a real sponsor's name.
export function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
