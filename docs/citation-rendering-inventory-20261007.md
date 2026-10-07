# Citation rendering inventory — 7 October 2026

Read-only production SQL Editor inventory. Portalite has ten document projects; all have stored covers and **zero renderedPages**. Another creator's document (Living Roof Systems on 3-Story SMF - DLS) also has only a cover and no renderedPages.

| Portalite project | Recorded page count | Full renderedPages | Cover |
| --- | ---: | --- | --- |
| Analysis of a Single-Degree- of-Freedom (SDOF) StructurE | 18 | None | Yes |
| Catalogue of Performative Poses. | Unknown | None | Yes |
| I'm feeling font | 5 | None | Yes |
| Intro to Structural Dynamics for undergraduate engineers | Unknown | None | Yes |
| Mapped | Unknown | None | Yes |
| Paper Pens | 7 | None | Yes |
| Plant Cell Microscope Photography | Unknown | None | Yes |
| Quantification of Modeling Uncertainty in the Rayleigh Damping Model | Unknown | None | Yes |
| Tribute to Helvetica | 30 | None | Yes |
| Wet Paint | 101 | None | Yes |

Unknown means the guarded attachment_page_count returned zero, not that the original has no pages. Persistent project_pages IDs currently exist only for recorded counts; an original with unknown count still needs processing metadata before every page can have an address.

The existing PDF processor is the proper long-term pre-rendering mechanism, but deploying it alone does not prove these attachment records will be hydrated. Its documented v2 jobs/completion contract writes immutable page outputs; queue coverage and completion-to-project_attachments metadata integration must be verified for these existing documents. Deployment, enqueue/backfill and Storage writes remain separate approval gates. No worker deployment or Storage change was performed.

The immediate browser fallback reuses PdfPage/pdf.js plus multipartMedia, requests the chosen page and renders one canvas. Paper Pens page 1 and Living Roof Systems page 7 were observed rendering in the unpublished production-connected preview. A rendering failure shows the stored project cover with the original page number and a preview-unavailable label. References and Studio summaries use covers, without downloading multipart PDF originals.
