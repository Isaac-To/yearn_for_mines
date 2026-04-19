import { describe, it, expect } from 'vitest';
import { levenshteinDistance, findClosestMatches } from '../../utils/string-match.js';

describe('String Match Utils', () => {
  describe('levenshteinDistance', () => {
    it('calculates the correct distance between identical strings', () => {
      expect(levenshteinDistance('diamond', 'diamond')).toBe(0);
    });

    it('calculates the correct distance for single character differences', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3); // k->s, e->i, +g
      expect(levenshteinDistance('diamond', 'dimond')).toBe(1); // missing a
    });

    it('is case sensitive', () => {
      expect(levenshteinDistance('Diamond', 'diamond')).toBe(1);
    });
  });

  describe('findClosestMatches', () => {
    const validOptions = [
      'diamond_ore',
      'diamond_sword',
      'diamond_pickaxe',
      'dirt',
      'diamond_block',
      'oak_log',
      'stone'
    ];

    it('returns closest matches for a misspelled word', () => {
      const matches = findClosestMatches('diamond', validOptions, 3);
      expect(matches).toEqual(['diamond_ore', 'diamond_sword', 'diamond_block']);
    });

    it('returns exact match first', () => {
      const matches = findClosestMatches('dirt', validOptions);
      expect(matches[0]).toBe('dirt');
    });

    it('is case insensitive when matching', () => {
      const matches = findClosestMatches('DiAmOnD', validOptions, 2);
      expect(matches).toEqual(['diamond_ore', 'diamond_sword']);
    });

    it('handles empty input or options', () => {
      expect(findClosestMatches('', validOptions)).toEqual([]);
      expect(findClosestMatches('diamond', [])).toEqual([]);
    });

    it('limits results to topK', () => {
      const matches = findClosestMatches('diamond', validOptions, 2);
      expect(matches.length).toBe(2);
    });
  });
});
