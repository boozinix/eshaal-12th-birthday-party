
CREATE TABLE public.rsvps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  child_name TEXT NOT NULL,
  child_age INTEGER,
  attending BOOLEAN NOT NULL,
  sleepover BOOLEAN NOT NULL DEFAULT false,
  allergies TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.rsvps TO anon, authenticated;
GRANT ALL ON public.rsvps TO service_role;

ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit an RSVP"
  ON public.rsvps FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
