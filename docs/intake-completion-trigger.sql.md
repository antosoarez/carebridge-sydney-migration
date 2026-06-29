# Intake completion → advocate "Review intake" to-do

Run in Supabase SQL editor. Creates a trigger so that when a client submits
their health intake form (`client_intake.submitted_at` transitions from NULL
to a timestamp), a high-priority to-do task is automatically created for the
advocate to review and start the report.

```sql
create or replace function public.on_client_intake_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advocate uuid;
  v_name text;
begin
  if (tg_op = 'UPDATE' and old.submitted_at is not null) then
    return new;
  end if;
  if new.submitted_at is null then
    return new;
  end if;

  -- Pick any advocate (single-advocate practice). Adjust if multi-advocate.
  select ur.user_id into v_advocate
  from public.user_roles ur
  where ur.role = 'advocate'
  order by ur.created_at asc
  limit 1;

  if v_advocate is null then
    return new;
  end if;

  select coalesce(p.full_name, p.email, 'Client')
  into v_name
  from public.profiles p
  where p.id = new.client_id;

  insert into public.tasks (client_id, title, description, status, created_by, is_priority)
  values (
    new.client_id,
    'Review intake & start report — ' || coalesce(v_name, 'client'),
    'The client has completed the health intake form. Review their answers and begin the report.',
    'to_do',
    v_advocate,
    true
  );

  return new;
end;
$$;

drop trigger if exists trg_client_intake_submitted on public.client_intake;
create trigger trg_client_intake_submitted
after insert or update of submitted_at on public.client_intake
for each row execute function public.on_client_intake_submitted();
```
