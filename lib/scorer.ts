
export interface Note {
  pitch: number,
  duration: number
}

function error(a: Note, b: Note) {
  return Math.abs(a.pitch - b.pitch) + Math.abs(a.duration - b.duration);
}

function findStartPos(playedNotes: Note[], actualNotes: Note[]) {
  let startPos = 0, endPos = 5;
  let minError = 9999, startInd = 0, curError = 0;
  while (endPos < actualNotes.length) {
    const a = actualNotes[startPos], b = playedNotes[startPos];
    const c = actualNotes[endPos], d = playedNotes[endPos];
    curError -= error(a, b);
    curError += error(c, d);
    startPos--;
    endPos++;

    if (curError < minError) {
      minError = curError;
      startInd = startPos;
    }
  }
  return startInd;
}

export default function score(playedNotes: Note[], actualNotes: Note[]) {

}