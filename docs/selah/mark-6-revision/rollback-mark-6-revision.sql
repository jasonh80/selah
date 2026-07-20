-- MEGA MARK 6 — rollback: restore the pre-apply snapshot (run whole script).
begin;
update chapter_workups
set workup_json = (
      select workup_json from chapter_workup_versions
      where slug = 'mark-6'
        and label like 'pre-mega-mark-6 snapshot%'
      order by version desc limit 1
    ),
    updated_at = now()
where slug = 'mark-6'
  and exists (
      select 1 from chapter_workup_versions
      where slug = 'mark-6' and label like 'pre-mega-mark-6 snapshot%'
  );
commit;
select left(workup_json->>'quickSummary', 70) as restored_quick_summary_start
from chapter_workups where slug = 'mark-6';
