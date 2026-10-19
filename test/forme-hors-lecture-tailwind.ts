// Concaténation volontaire : le scanner Tailwind ne doit pas émettre cette classe depuis un test.
export function formeHorsLectureTailwind(...morceaux: string[]): string {
  return morceaux.join("")
}
