export function levenshteinDistance(a: string, b: string): number {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) == a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Returns the top K closest matching strings from a list of predefined valid strings.
 * Prioritizes substrings/includes.
 */
export function findClosestMatches(input: string, validOptions: string[], topK: number = 3): string[] {
  if (!input || !validOptions || validOptions.length === 0) return [];
  
  const lowerInput = input.toLowerCase();

  const distances = validOptions.map(option => {
    const lowerOption = option.toLowerCase();
    let distance = levenshteinDistance(lowerInput, lowerOption);
    
    // Give a huge boost if it contains the input
    if (lowerOption.includes(lowerInput)) {
      // Still order by length difference so exact matches or shorter strings come first
      distance = Math.abs(lowerOption.length - lowerInput.length) - 1000;
    }

    return { option, distance };
  });

  distances.sort((a, b) => a.distance - b.distance);

  return distances.slice(0, topK).map(d => d.option);
}
