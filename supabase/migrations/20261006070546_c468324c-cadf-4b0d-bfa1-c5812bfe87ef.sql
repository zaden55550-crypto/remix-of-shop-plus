CREATE TYPE public.app_role AS ENUM ('support');
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role public.app_role NOT NULL, UNIQUE (user_id, role));
GRANT SELECT ON public.user_roles TO authenticated; GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE TABLE public.support_threads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, shop_name text NOT NULL DEFAULT '', contact_email text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')), needs_human boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.support_threads TO authenticated; GRANT ALL ON public.support_threads TO service_role;
ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner or support read threads" ON public.support_threads FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'support'));
CREATE POLICY "owner creates thread" ON public.support_threads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner or support update thread" ON public.support_threads FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'support')) WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'support'));

CREATE TABLE public.support_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE, sender text NOT NULL CHECK (sender IN ('user','ai','support')), body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX support_messages_thread_idx ON public.support_messages(thread_id, created_at);
GRANT SELECT, INSERT ON public.support_messages TO authenticated; GRANT ALL ON public.support_messages TO service_role;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read thread messages" ON public.support_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND (t.user_id = auth.uid() OR public.has_role(auth.uid(),'support'))));
CREATE POLICY "owner writes user messages" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (sender = 'user' AND EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));
CREATE POLICY "support writes replies" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (sender = 'support' AND public.has_role(auth.uid(),'support'));
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;