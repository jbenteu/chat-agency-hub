-- Allow gestors/CS/gerentes/admins to delete user_relationships they manage
CREATE POLICY "user_relationships_delete"
ON public.user_relationships
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'gerente', 'gestor', 'sucesso_cliente')
  )
);
