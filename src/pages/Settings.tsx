import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera, Lock, User, GitBranch, Sliders } from "lucide-react";
import { PipelineStagesConfig } from "@/components/crm/PipelineStagesConfig";
import { CustomFieldsManager } from "@/components/crm/CustomFieldsManager";

const SettingsPage = () => {
  const { profile, user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [email, setEmail] = useState(profile?.email ?? user?.email ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Erro", description: "A imagem deve ter no máximo 2MB.", variant: "destructive" });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleUploadAvatar = async () => {
    if (!avatarFile || !user) return;
    setUploadingAvatar(true);
    try {
      const ext = avatarFile.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/profile.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: `${urlData.publicUrl}?t=${Date.now()}` })
        .eq("id", user.id);
      if (updateError) throw updateError;
      await refreshProfile();
      setAvatarFile(null);
      setAvatarPreview(null);
      toast({ title: "Foto atualizada com sucesso!" });
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", user!.id);
      if (error) throw error;
      if (email !== user?.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email });
        if (emailError) {
          toast({ title: "Erro", description: "Erro ao atualizar e-mail.", variant: "destructive" });
          return;
        }
        toast({ title: "E-mail atualizado", description: "Verifique sua caixa de entrada para confirmar." });
      }
      await refreshProfile();
      toast({ title: "Perfil atualizado com sucesso!" });
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Erro", description: "A senha deve ter no mínimo 8 caracteres.", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword("");
      toast({ title: "Senha alterada com sucesso!" });
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie seu perfil e as configurações do CRM</p>
        </div>

        <Tabs defaultValue="perfil" className="w-full">
          <TabsList className="mb-2">
            <TabsTrigger value="perfil" className="gap-1.5">
              <User className="h-3.5 w-3.5" /> Perfil
            </TabsTrigger>
            <TabsTrigger value="seguranca" className="gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Segurança
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="gap-1.5">
              <GitBranch className="h-3.5 w-3.5" /> Pipeline
            </TabsTrigger>
            <TabsTrigger value="campos" className="gap-1.5">
              <Sliders className="h-3.5 w-3.5" /> Campos
            </TabsTrigger>
          </TabsList>

          {/* ── Perfil ── */}
          <TabsContent value="perfil">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" /> Perfil Pessoal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={avatarPreview ?? profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-lg">{getInitials(profile?.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex gap-2">
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Camera className="mr-2 h-4 w-4" /> Alterar foto
                    </Button>
                    {avatarFile && (
                      <Button size="sm" onClick={handleUploadAvatar} disabled={uploadingAvatar}>
                        {uploadingAvatar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Salvar foto
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Nome completo</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-mail</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>
                <Button onClick={handleSaveProfile} disabled={savingProfile}>
                  {savingProfile ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : "Salvar alterações"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Segurança ── */}
          <TabsContent value="seguranca">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="h-4 w-4" /> Segurança
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Senha atual</Label>
                  <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Nova senha</Label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Confirmar nova senha</Label>
                    <Input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} />
                  </div>
                </div>
                <Button onClick={handleChangePassword} disabled={savingPassword}>
                  {savingPassword ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Alterando...</> : "Alterar senha"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Pipeline ── */}
          <TabsContent value="pipeline">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="h-4 w-4" /> Estágios do Pipeline
                </CardTitle>
                <CardDescription>
                  Configure os estágios do funil de vendas. Arraste para reordenar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PipelineStagesConfig />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Campos ── */}
          <TabsContent value="campos">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sliders className="h-4 w-4" /> Campos Personalizados
                </CardTitle>
                <CardDescription>
                  Adicione campos extras aos contatos. Campos padrão (Nome, Telefone) não podem ser excluídos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CustomFieldsManager />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
