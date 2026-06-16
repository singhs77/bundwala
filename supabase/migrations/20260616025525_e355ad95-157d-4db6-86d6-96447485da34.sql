CREATE POLICY "Deny all direct access to activity_audit"
ON public.activity_audit
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);