# Brand Identity Specification

## Direction
Brand theme: `Executive Premium`.

Goals:
1. Convey trust, precision, and operational confidence.
2. Keep visuals clean and disciplined for low-literacy users.
3. Maintain consistency across all modules and screen sizes.

## Logo Usage
1. Keep clear space equal to the logo icon width on all sides.
2. Do not stretch, rotate, or apply unapproved colors.
3. Use full-color logo on light surfaces.
4. Use inverse logo on dark surfaces only when contrast is sufficient.

## Color Roles
Semantic color groups are required:
1. `surface-*`: background layers and cards.
2. `text-*`: readable hierarchy and emphasis.
3. `action-*`: primary/secondary/destructive actions.
4. `status-*`: success, warning, error, info system feedback.
5. `focus-*`: keyboard and assistive focus visibility.

Rules:
1. Never use arbitrary colors for status messages.
2. Keep minimum contrast at WCAG AA:
- Text: 4.5:1
- Large text/UI components: 3:1
3. Reserve saturated colors for action and status, not decoration.

## Typography Scale
Primary family: `SS Huchu`.
Fallbacks: `"Segoe UI", "Helvetica Neue", Arial, sans-serif`.

Required semantic sizes:
1. `text-page-title`
2. `text-section-title`
3. `text-field-label`
4. `text-field-help`
5. `text-table-cell`

Rules:
1. Field labels should be semibold and always visible.
2. Helper text must remain readable on mobile.
3. Table text must stay compact but legible.

## Iconography
1. Use a single icon family (`lucide-react`) for consistency.
2. Icons must support meaning, not replace labels.
3. Standard icon sizes:
- 16px inline
- 18px with labels
- 20px for section actions

## Elevation and Surfaces
1. Prefer subtle borders over heavy shadows.
2. Use elevation only to clarify hierarchy (popover/dialog/sticky actions).
3. Cards should be clear and dense, not visually noisy.

## Motion
1. Use short, meaningful transitions:
- Enter/exit: 120ms to 180ms
- Focus or state change: 80ms to 120ms
2. Avoid decorative motion loops.
3. Respect reduced-motion settings where supported.

## Interaction Personality
1. Confident and direct wording.
2. No ambiguous prompts.
3. Every confirmation should state:
- What just happened
- What to do next

## Consistency Checklist
1. Is the page using semantic color tokens only?
2. Are typography roles applied correctly?
3. Are state styles (loading/empty/error/success) present?
4. Is there one clear primary action?
5. Is keyboard focus visible for all controls?
