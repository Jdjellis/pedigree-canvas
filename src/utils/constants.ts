// Symbol dimensions (at 1x zoom)
export const SYMBOL_SIZE = 40;
export const SYMBOL_STROKE_WIDTH = 2;
export const SYMBOL_COLOR = '#1a1a1a';
export const SYMBOL_FILL = '#ffffff';
// Default legend condition colors
export const DEFAULT_CONDITION_COLORS = ['#1a1a1a', '#e63946', '#457b9d', '#2a9d8f'];

// Layout spacing
export const GENERATION_SPACING = 150;
/**
 * Vertical gap between a parentless sibship's horizontal bar and the top of its
 * children. Half a generation reads as "these are siblings" without implying a
 * parent couple sits above.
 */
export const PARENTLESS_SIBSHIP_RISE = GENERATION_SPACING / 2;
export const SIBLING_SPACING = 80;
export const PARTNER_SPACING = 120;
export const PARENT_CHILD_OFFSET = 50;
/**
 * Minimum horizontal gap between two nodes in the same generation, used by the
 * bounded auto-respacing on add. Sized to twice the symbol width (SYMBOL_SIZE)
 * so symbols never visually overlap; matches SIBLING_SPACING as a reference.
 */
export const MIN_GENERATION_NODE_SPACING = SYMBOL_SIZE * 2;

// Connection lines
export const LINE_COLOR = '#1a1a1a';
export const LINE_WIDTH = 2;
export const CONSANGUINITY_GAP = 4;
export const DASH_PATTERN = [8, 4];

// Adoption brackets (square brackets enclosing an adopted individual's symbol).
// Geometry is centred on the symbol origin (0,0).
/** Horizontal distance from the symbol centre to each bracket's vertical stroke. */
export const ADOPTION_BRACKET_GAP = SYMBOL_SIZE / 2 + 7;
/** Vertical half-height of each bracket (extends a little past the symbol). */
export const ADOPTION_BRACKET_HALF_HEIGHT = SYMBOL_SIZE / 2 + 5;
/** Length of the short horizontal arms at the top and bottom of each bracket. */
export const ADOPTION_BRACKET_ARM = 6;

// Twin "?" label (unknown zygosity) and consanguinity degree annotation.
/** Font size for the unknown-zygosity "?" drawn at the twin convergence point. */
export const TWIN_UNKNOWN_FONT_SIZE = 16;
/** Vertical gap above a line at which a small annotation's baseline/box sits. */
export const RELATIONSHIP_LABEL_OFFSET = 6;

// Grid
export const GRID_SIZE = 20;
export const GRID_COLOR = '#e5e5e5';

// Viewport
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
export const ZOOM_STEP = 1.1;
export const DEFAULT_ZOOM = 1;
// Wheel/trackpad navigation. Ctrl/Cmd+wheel and trackpad pinch zoom toward the
// cursor; a plain wheel/two-finger scroll pans. Sensitivity converts (delta-mode
// normalized) wheel deltaY into an exponential zoom factor.
export const ZOOM_WHEEL_SENSITIVITY = 0.0015;
// Pixels-per-line used to normalize line-mode (DOM_DELTA_LINE) wheel events,
// which classic mouse wheels emit, into pixel-equivalent deltas.
export const WHEEL_LINE_HEIGHT = 16;

// Radial menu
export const RADIAL_MENU_RADIUS = 60;

// Hover-to-open hysteresis for the radial add-menu (screen pixels, measured
// from a person's screen centre). ENTER is a generous target so the menu opens
// when the pointer comes *near* a person, not only when directly over the 40px
// symbol. EXIT is deliberately larger than ENTER — and larger than the orbiting
// option buttons (~56–87px out) — so the pointer can travel from the symbol out
// to an option without the menu vanishing first.
export const RADIAL_HOVER_ENTER_RADIUS = 46;
export const RADIAL_HOVER_EXIT_RADIUS = 170;

// Label
export const LABEL_FONT_SIZE = 12;
export const LABEL_FONT_FAMILY = 'Inter, system-ui, -apple-system, sans-serif';
export const LABEL_COLOR = '#333333';
export const LABEL_OFFSET_Y = 8;

// Free-text annotations
/** Default font size (canvas units) for a newly created text annotation. */
export const ANNOTATION_DEFAULT_FONT_SIZE = 10;
/** Placeholder text a new annotation opens with before the user types. */
export const ANNOTATION_PLACEHOLDER_TEXT = 'Text';
/**
 * Rough average glyph width as a fraction of the font size, used to estimate a
 * text block's width without measuring it on a canvas. Shared by the on-canvas
 * selection box, viewport fit, and smart text placement so they all agree.
 */
export const ANNOTATION_GLYPH_WIDTH_RATIO = 0.6;
/**
 * Vertical gap (canvas units) left between the lowest existing content and a
 * newly dropped annotation, so it lands in clear space rather than on top of a
 * symbol. See {@link computeAnnotationDropPosition}.
 */
export const ANNOTATION_DROP_GAP = SYMBOL_SIZE;

// Proband arrow
export const PROBAND_ARROW_SIZE = 10;

// Deceased slash
export const DECEASED_SLASH_OVERSHOOT = 5;
