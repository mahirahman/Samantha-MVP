-- Backfill first_name/last_name/middle_name for existing patients that only
-- have full_name populated (e.g. rows created before the name columns were
-- split out, or seeded directly). Only fills columns that are currently
-- empty, splitting full_name on whitespace: first token -> first_name, last
-- token -> last_name, any remaining middle tokens -> middle_name.
with split_names as (
  select
    id,
    regexp_split_to_array(trim(full_name), '\s+') as name_parts
  from public.patients
  where full_name is not null
    and trim(full_name) <> ''
    and (first_name is null or last_name is null)
)
update public.patients p
set
  first_name = coalesce(p.first_name, split_names.name_parts[1]),
  last_name = coalesce(
    p.last_name,
    case
      when array_length(split_names.name_parts, 1) > 1
        then split_names.name_parts[array_length(split_names.name_parts, 1)]
      else null
    end
  ),
  middle_name = coalesce(
    p.middle_name,
    case
      when array_length(split_names.name_parts, 1) > 2
        then array_to_string(
          split_names.name_parts[2:array_length(split_names.name_parts, 1) - 1],
          ' '
        )
      else null
    end
  )
from split_names
where p.id = split_names.id;
