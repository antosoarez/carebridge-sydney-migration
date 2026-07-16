create or replace function public.get_unread_message_counts()
returns table (thread_id uuid, unread_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;

  return query
  select m.thread_id,
         count(*)::bigint as unread_count
    from public.messages as m
    join public.message_threads as t on t.id = m.thread_id
   where m.read_at is null
     and m.sender_id <> uid
     and (t.client_id = uid or t.advocate_id = uid)
   group by m.thread_id
   order by m.thread_id;
end;
$$;

revoke all on function public.get_unread_message_counts() from public;
grant execute on function public.get_unread_message_counts() to authenticated;
