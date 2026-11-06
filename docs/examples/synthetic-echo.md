# A small, verified workflow

This example was exercised through the integrated browser UI and real Codex CLI
on 2026-11-01. It uses two synthetic text outputs; no private business case,
image generation, Feishu document or external publication is part of this example.

1. Start a new persistent task and ask for an **Echo Standard**. Compare an existing
   output after trimming leading and trailing whitespace with `OK`. Keep only two
   labels: satisfied / not satisfied, with no numeric score or weights. No samples
   are needed to create the standard. The agent writes a manifest; the backend
   registers it in Standards.
2. Ask for a two-row dataset and separately provide the already existing outputs:

   | caseId | Input | Expected | Existing output |
   | --- | --- | --- | --- |
   | echo-a | Reply OK | OK | OK |
   | echo-b | Reply OK | OK | NO |

   The dataset and output batch are distinct resources. The verification also
   revised their record container while retaining the original immutable versions.
3. Select fixed standard, dataset and output versions. Run an evaluation of those
   two existing outputs. A new scoring batch stores `echo-a = 满足` and
   `echo-b = 未满足`, with original output and evidence pointers. No extra answers
   or numeric scores are generated.
4. Import a report template with exactly three headings, `本次结论`, `逐条证据`, and
   `证据边界`. Select that template and the existing scoring version. Ask for a report.
   The report is registered under Reports, with the template version and source
   scoring hash retained. It does not create another scoring batch.
5. Reload the page. Read back the same session, versions, records and report.
   Reopening does not start another CLI run.

Observed result: five submissions in one native Codex thread, including the explicit
version-revision step, completed. The dataset and output batch each contain two
records; there is one scoring batch. The final report retains the exact three
headings in order and both original judgments. Backend registration errors are
checked independently of the model's completion message.

A parser issue found during this verification was fixed: an `artifacts` record
array must not silently become zero indexed rows. Supported record containers are
validated; multiple candidates require an explicit `metadata.recordsField`.
The test retained the earlier version and created a corrected new version, instead
of rewriting history. These results validate the workflow, not model quality on a
real business dataset.
