import * as vscode from "vscode"

export class MockTextDocument implements vscode.TextDocument {
  uri: vscode.Uri
  fileName: string
  isUntitled: boolean
  languageId: string
  version: number
  isDirty: boolean
  isClosed: boolean
  encoding: string = "utf8"

  private content: string
  private lines: string[]

  constructor(uri: vscode.Uri, content: string = "") {
    this.uri = uri
    this.fileName = uri.fsPath
    this.isUntitled = uri.scheme === "untitled"
    this.languageId = "typescript"
    this.version = 1
    this.isDirty = false
    this.isClosed = false
    this.content = content
    this.lines = content.split(/\r?\n/)
  }

  save(): Thenable<boolean> {
    return Promise.resolve(true)
  }

  get eol(): vscode.EndOfLine {
    return vscode.EndOfLine.LF
  }

  get lineCount(): number {
    return this.lines.length
  }

  lineAt(line: number | vscode.Position): vscode.TextLine {
    let lineNumber = typeof line === "number" ? line : line.line
    const text = this.lines[lineNumber] || ""
    return {
      lineNumber,
      text,
      range: new vscode.Range(lineNumber, 0, lineNumber, text.length),
      rangeIncludingLineBreak: new vscode.Range(lineNumber, 0, lineNumber, text.length + 1),
      firstNonWhitespaceCharacterIndex: text.search(/\S/),
      isEmptyOrWhitespace: text.trim() === "",
    }
  }

  offsetAt(position: vscode.Position): number {
    let offset = 0
    for (let i = 0; i < position.line; i++) {
      offset += this.lines[i].length + 1 // +1 for newline
    }
    return offset + position.character
  }

  positionAt(offset: number): vscode.Position {
    let currentOffset = 0
    for (let i = 0; i < this.lines.length; i++) {
      const lineLength = this.lines[i].length + 1
      if (currentOffset + lineLength > offset) {
        return new vscode.Position(i, offset - currentOffset)
      }
      currentOffset += lineLength
    }
    return new vscode.Position(this.lines.length - 1, this.lines[this.lines.length - 1].length)
  }

  getText(range?: vscode.Range): string {
    if (!range) return this.content

    if (range.start.line === range.end.line) {
      return this.lines[range.start.line].substring(range.start.character, range.end.character)
    }

    let result = this.lines[range.start.line].substring(range.start.character) + "\n"
    for (let i = range.start.line + 1; i < range.end.line; i++) {
      result += this.lines[i] + "\n"
    }
    result += this.lines[range.end.line].substring(0, range.end.character)
    return result
  }

  getWordRangeAtPosition(position: vscode.Position, regex?: RegExp): vscode.Range | undefined {
    return new vscode.Range(position, position)
  }

  validateRange(range: vscode.Range): vscode.Range {
    return range
  }

  validatePosition(position: vscode.Position): vscode.Position {
    return position
  }
}
