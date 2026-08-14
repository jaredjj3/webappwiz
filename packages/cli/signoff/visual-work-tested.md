# Visual work is trivial or tested

A change to what a person sees or does lands on its own when it is trivial, or
when a test pins down what it did. What needs a person is the change that is
neither: something whose look or behavior nobody can confirm without looking
at it.

Trivial is a property of the change, not of the file it is in. A copy fix, a
color, a spacing value, a renamed label: the diff is the whole story, and
reading it is the same as looking at the result. A new screen, a reworked
layout, a changed interaction: the diff says what was written, never what it
looks like once it runs.

A test settles it either way. Visual work a test covers has already been
looked at, by something that will keep looking every merge after this one. The
question this rule asks a person is only ever asked about work nothing pins
down: is this what you meant it to look like?

## Ships

- a copy fix, a corrected label, a typo in a heading
- a color, a spacing value, a font size, a border
- a renamed button or menu item
- a new screen, layout or interaction a test covers
- a component moved or renamed with its rendering unchanged

## Needs review

- a new screen, page or dialog nothing tests
- a layout reworked, and nothing asserting the result
- a changed interaction: what a click, a drag or a keystroke now does
- new CLI output, or a reshaped table or report, no test reads
