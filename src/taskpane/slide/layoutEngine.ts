/**
 * Layout engine for slide-level operations (D-01, D-03, LYOT-02, LYOT-03).
 * Detects slide dimensions and creates new slides at the current deck position.
 */

import { WIDESCREEN } from "./constants";

/**
 * Detects the width of slides in the current presentation.
 *
 * Attempts to read the width of the first slide. If no slides exist
 * or reading fails, returns the widescreen default (960pt).
 *
 * @returns Slide width in points.
 */
export async function detectSlideWidth(
  context: PowerPoint.RequestContext
): Promise<number> {
  try {
    const slides = context.presentation.slides;
    const firstSlide = slides.getItemAt(0);
    firstSlide.load("id");
    await context.sync();

    // If we got here, slides exist. Use widescreen default for now
    // since slide width is not directly readable from the Slide object in API 1.8.
    // A future enhancement could read slideMaster dimensions.
    return WIDESCREEN.width;
  } catch {
    // No slides or read failed — return widescreen default
    return WIDESCREEN.width;
  }
}

/**
 * Adds a new slide at the current position in the deck.
 *
 * - PREVIEW path (API 1.9+): Uses AddSlideOptions.index to insert after the
 *   currently selected slide.
 * - GA fallback: Appends to the end of the deck.
 *
 * @returns The newly created slide proxy object.
 */
export async function addSlideAtCurrentPosition(
  context: PowerPoint.RequestContext
): Promise<PowerPoint.Slide> {
  const slides = context.presentation.slides;

  // PREVIEW path: insert at specific index (D-03, LYOT-03)
  if (Office.context.requirements.isSetSupported("PowerPointApi", "1.9")) {
    try {
      // Get selected slides to find current position
      const selectedSlides = context.presentation.getSelectedSlides();
      selectedSlides.load("items");
      await context.sync();

      if (selectedSlides.items.length > 0) {
        // Find the index of the selected slide
        const selectedSlide = selectedSlides.items[0];
        selectedSlide.load("id");
        slides.load("items");
        await context.sync();

        let selectedIndex = 0;
        for (let i = 0; i < slides.items.length; i++) {
          if (slides.items[i].id === selectedSlide.id) {
            selectedIndex = i;
            break;
          }
        }

        // Insert after the selected slide
        slides.add({ index: selectedIndex + 1 } as any);
        await context.sync();

        const newSlide = slides.getItemAt(selectedIndex + 1);
        newSlide.load("id");
        await context.sync();

        // Remove default placeholder shapes
        await clearDefaultShapes(context, newSlide);

        return newSlide;
      }
    } catch {
      // PREVIEW API unavailable at runtime — fall through to GA path
    }
  }

  // GA fallback: append to end
  slides.add();
  await context.sync();

  const count = slides.getCount();
  await context.sync();

  const newSlide = slides.getItemAt(count.value - 1);
  newSlide.load("id");
  await context.sync();

  // Remove default placeholder shapes (title, subtitle) so we start with a blank slide
  await clearDefaultShapes(context, newSlide);

  return newSlide;
}

/**
 * Removes all default placeholder shapes from a newly created slide.
 * PowerPoint adds "Click to add title" and "Click to add subtitle" shapes
 * by default — we need a blank canvas for our custom rendering.
 */
async function clearDefaultShapes(
  context: PowerPoint.RequestContext,
  slide: PowerPoint.Slide
): Promise<void> {
  const shapes = slide.shapes;
  shapes.load("items");
  await context.sync();

  // Delete all existing shapes (they are default placeholders)
  for (let i = shapes.items.length - 1; i >= 0; i--) {
    shapes.items[i].delete();
  }
  await context.sync();
}
