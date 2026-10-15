# References and exports — app screenshots

Captured from the **real app root and components** in a localhost QA harness,
with synthetic account/project services and transport. No production reference
rows were written. Mobile screenshots use 420 × 912 CSS pixels; desktop uses
1280 × 900. Additional 390/430 phone-width checks showed no horizontal overflow.
This is browser evidence, not physical-phone or production integration testing.

## Studio Overview

Recent draft:

![Overview with draft](overview-draft.jpg)

No draft:

![Overview without draft](overview-no-draft.jpg)

## References and confirmation

![Mixed References tab](references-tab.jpg)

![Resolved Add reference preview](add-reference-resolved.jpg)

![Edit reference with unverified text](edit-reference-text.jpg)

![External reference actions](reference-actions.jpg)

![Existing References screen actions with Export](references-screen-actions.jpg)

## Published and exports

The second row has zero references and no reference pill. Dates are made-on
dates (June 15, 2024 and February 10, 2023), independent of this week's publication.

![Published made-on dates](published-made-on.jpg)

![Published actions](published-actions.jpg)

![Export choices](export-choices.jpg)

![Mixed bibliography and copy confirmation](bibliography.jpg)

![Portfolio PDF download sheet](portfolio-export-sheet.jpg)

## Project references and own citation

![Owner References](project-owner-references.jpg)

![Own reader Copy citation and Export](project-actions-copy-export.jpg)

![Desktop owner project actions](project-owner-desktop-actions.jpg)

![Signed-out mobile References](project-visitor-references.jpg)

![Signed-out desktop References](project-visitor-desktop.jpg)

## Real generated Portfolio PDF

[Synthetic 16-project PDF](portfolio-16.pdf): eight pages, generated with the
actual Python renderer. First and last pages were rendered and inspected; all
16 projects are present. The local authenticated HTTP adapter also produced
eight pages and rejected missing authentication. The browser download used this
generated file through its synthetic transport; a hosted PDF service is pending.

![First PDF page](portfolio-first.png)

![Last PDF page](portfolio-last.png)
