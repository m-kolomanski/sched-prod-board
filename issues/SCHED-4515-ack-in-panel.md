---
id: SCHED-4515
title: Ack moves from the row into an incident panel
status: done
plan: R1, R2
---

Product's decision after the step-1 recording (00:13: the pointer aimed at INC-3303's Ack, a new incident
arrived, and INC-4465 got acked): "New incidents stay live at the top. Ack leaves the row: a row opens its
incident panel, and Ack lives there."

- Rows have no Ack button (`data-testid="ack"` removed). Click or Enter on a row opens `incident-panel`,
  which names the incident id.
- `panel-ack` in the panel acks the incident the panel names, by id.
- New incidents still go live at the top (R1). Existing rows are never removed or rebuilt, and the panel
  is not re-rendered on refresh, so nothing changes under a pointer that is about to click Ack.

Acceptance: if a new incident lands mid-click, the panel names a different incident than the one meant, and
on-call can see that before acking. The ack always goes to the incident the panel names.
