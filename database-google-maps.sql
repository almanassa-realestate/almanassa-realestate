alter table public.properties add column if not exists google_maps_url text;
alter table public.properties add constraint properties_google_maps_url_check check (google_maps_url is null or (length(google_maps_url)<=4096 and google_maps_url ~ '^https://(maps[.]app[.]goo[.]gl/[^[:space:]]+|goo[.]gl/maps/[^[:space:]]+|maps[.]google[.]com/[^[:space:]]*|(www[.])?google[.]com/maps([/?][^[:space:]]*)?)$'));
CREATE OR REPLACE FUNCTION public.save_property_editor(property_id_input uuid, expected_updated_at timestamp with time zone, details jsonb, images jsonb, video_url_input text)
 RETURNS properties
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  current_property public.properties;
  saved_property public.properties;
  item jsonb;
  image_path text;
  position integer := 0;
begin
  if auth.uid() is null or not private.is_editor() then raise exception 'EDITOR_REQUIRED'; end if;
  select * into current_property from public.properties where id=property_id_input for update;
  if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;
  if current_property.updated_at is distinct from expected_updated_at then raise exception 'EDIT_CONFLICT'; end if;
  if length(trim(coalesce(details->>'title',''))) not between 1 and 160 then raise exception 'INVALID_TITLE'; end if;
  if coalesce(length(details->>'description'),0)>6000 then raise exception 'INVALID_DESCRIPTION'; end if;
  if coalesce(details->>'type','') not in ('أرض','مزرعة','استراحة','منزل','تجاري') then raise exception 'INVALID_TYPE'; end if;
  if not exists(select 1 from public.areas where id=(details->>'area_id')::uuid and is_active) then raise exception 'INVALID_AREA'; end if;
  if details->>'price_type' <> 'on_request' and (details->>'price' is null or details->>'price_basis' not in ('total','per_m2')) then raise exception 'PRICE_BASIS_REQUIRED'; end if;
  if jsonb_typeof(images) is distinct from 'array' or jsonb_array_length(images)>20 then raise exception 'INVALID_IMAGES'; end if;
  if video_url_input is not null and video_url_input !~ '^https://[^[:space:]]+$' then raise exception 'INVALID_VIDEO'; end if;
  for item in select value from jsonb_array_elements(images) loop
    image_path := item->>'storage_path';
    if image_path is null or split_part(image_path,'/',1)<>property_id_input::text or not exists(select 1 from storage.objects where bucket_id='property-media' and name=image_path) then raise exception 'INVALID_IMAGE_PATH'; end if;
  end loop;
  if (select count(distinct value->>'storage_path') from jsonb_array_elements(images))<>jsonb_array_length(images) then raise exception 'DUPLICATE_IMAGES'; end if;
  update public.properties set
    title=trim(details->>'title'), type=details->>'type', area_id=(details->>'area_id')::uuid,
    size_m2=(details->>'size_m2')::numeric,
    price=case when details->>'price_type'='on_request' then null else (details->>'price')::numeric end,
    price_type=details->>'price_type', price_basis=details->>'price_basis',
    availability=details->>'availability', description=details->>'description',
    frontage_m=(details->>'frontage_m')::numeric, depth_m=(details->>'depth_m')::numeric,
    google_maps_url=case when details ? 'google_maps_url' then nullif(trim(details->>'google_maps_url'),'') else current_property.google_maps_url end,
    documents_status=details->>'documents_status', status=details->>'status',
    featured=coalesce((details->>'featured')::boolean,false), updated_by=auth.uid()
  where id=property_id_input returning * into saved_property;
  delete from public.property_images where property_id=property_id_input and storage_path not in (select value->>'storage_path' from jsonb_array_elements(images));
  update public.property_images set is_cover=false where property_id=property_id_input;
  for item in select value from jsonb_array_elements(images) loop
    insert into public.property_images(property_id,storage_path,alt_text,sort_order,is_cover)
    values(property_id_input,item->>'storage_path',saved_property.title,position,position=0)
    on conflict(storage_path) do update set alt_text=excluded.alt_text, sort_order=excluded.sort_order,is_cover=excluded.is_cover;
    position := position+1;
  end loop;
  delete from public.property_videos where property_id=property_id_input;
  if video_url_input is not null then
    insert into public.property_videos(property_id,video_url) values(property_id_input,video_url_input);
  end if;
  return saved_property;
end;
$function$
;
