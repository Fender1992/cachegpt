import { describe, it, expect } from 'vitest'
import { getQualityScore, analyzeResponse } from '@/lib/response-validator'

describe('Response Validator', () => {
  describe('getQualityScore', () => {
    it('should give high score to complete, detailed responses', () => {
      const goodResponse = `
        To solve this problem, you need to follow these steps:

        1. First, understand the requirements
        2. Design the architecture
        3. Implement the solution

        Here's a code example:
        \`\`\`javascript
        function solve() {
          return 42;
        }
        \`\`\`

        This approach is effective because it handles edge cases and is maintainable.
      `

      const score = getQualityScore(goodResponse)
      expect(score).toBeGreaterThan(0.7)
    })

    it('should give low score to very short responses', () => {
      const shortResponse = 'Yes.'
      const score = getQualityScore(shortResponse)
      expect(score).toBeLessThan(0.5)
    })

    it('should give low score to error messages', () => {
      const errorResponse = 'Error: Unable to process your request.'
      const score = getQualityScore(errorResponse)
      expect(score).toBeLessThan(0.4)
    })

    it('should give low score to generic/vague responses', () => {
      const vague = 'I think that depends on the situation and various factors.'
      const score = getQualityScore(vague)
      expect(score).toBeLessThan(0.6)
    })

    it('should reward structured content with examples', () => {
      const structured = `
        The answer is multi-faceted:

        **Benefits:**
        - Performance improvement
        - Better maintainability
        - Easier testing

        **Example:**
        \`\`\`python
        def example():
            pass
        \`\`\`

        **Conclusion:**
        This approach provides the best balance.
      `

      const score = getQualityScore(structured)
      expect(score).toBeGreaterThan(0.75)
    })
  })

  describe('analyzeResponse', () => {
    it('should detect incomplete responses', () => {
      const incomplete = 'The solution requires'
      const analysis = analyzeResponse(incomplete)

      expect(analysis.isComplete).toBe(false)
      expect(analysis.qualityScore).toBeLessThan(0.5)
    })

    it('should detect responses with code examples', () => {
      const withCode = `
        Here's how to do it:
        \`\`\`javascript
        const result = 42;
        \`\`\`
      `
      const analysis = analyzeResponse(withCode)

      expect(analysis.hasCodeExample).toBe(true)
    })

    it('should validate complete, high-quality responses', () => {
      const quality = `
        To implement this feature, follow these comprehensive steps:

        1. **Setup**: Configure your environment
        2. **Implementation**: Write the core logic
        3. **Testing**: Validate your solution

        \`\`\`typescript
        function implement(): string {
          return "quality implementation";
        }
        \`\`\`

        This approach ensures maintainability and scalability.
      `
      const analysis = analyzeResponse(quality)

      expect(analysis.isComplete).toBe(true)
      expect(analysis.hasCodeExample).toBe(true)
      expect(analysis.qualityScore).toBeGreaterThan(0.75)
    })
  })
})
