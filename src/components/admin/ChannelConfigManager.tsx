import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Save, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  XCircle,
  Facebook,
  Instagram,
  MessageSquare
} from 'lucide-react';

interface ChannelConfig {
  id?: string;
  channel: 'facebook' | 'instagram' | 'whatsapp';
  is_connected: boolean;
  account_id: string;
  workspace_id: string;
  config: {
    page_id?: string;
    page_name?: string;
    page_access_token?: string;
    instagram_account_id?: string;
    account_name?: string;
    phone_number_id?: string;
    phone_number?: string;
    access_token?: string;
    wa_id?: string;
    display_phone_number?: string;
  };
}

interface ChannelConfigManagerProps {
  workspaceId: string;
}

export const ChannelConfigManager = ({ workspaceId }: ChannelConfigManagerProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  
  const [facebookConfig, setFacebookConfig] = useState<ChannelConfig>({
    channel: 'facebook',
    is_connected: false,
    account_id: '',
    workspace_id: workspaceId,
    config: {
      page_id: '',
      page_name: '',
      page_access_token: ''
    }
  });

  const [instagramConfig, setInstagramConfig] = useState<ChannelConfig>({
    channel: 'instagram',
    is_connected: false,
    account_id: '',
    workspace_id: workspaceId,
    config: {
      instagram_account_id: '',
      account_name: '',
      page_access_token: '',
      page_id: ''
    }
  });

  const [whatsappConfig, setWhatsappConfig] = useState<ChannelConfig>({
    channel: 'whatsapp',
    is_connected: false,
    account_id: '',
    workspace_id: workspaceId,
    config: {
      phone_number_id: '',
      phone_number: '',
      access_token: '',
      wa_id: '',
      display_phone_number: ''
    }
  });

  useEffect(() => {
    loadConfigs();
  }, [workspaceId]);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data: integrations, error } = await supabase
        .from('channel_integrations')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (error) throw error;

      if (integrations) {
        integrations.forEach(integration => {
          const config = integration.config as any;
          
          if (integration.channel === 'facebook') {
            setFacebookConfig({
              id: integration.id,
              channel: 'facebook',
              is_connected: integration.is_connected || false,
              account_id: integration.account_id || '',
              workspace_id: workspaceId,
              config: {
                page_id: config?.page_id || '',
                page_name: config?.page_name || '',
                page_access_token: config?.page_access_token || ''
              }
            });
          } else if (integration.channel === 'instagram') {
            setInstagramConfig({
              id: integration.id,
              channel: 'instagram',
              is_connected: integration.is_connected || false,
              account_id: integration.account_id || '',
              workspace_id: workspaceId,
              config: {
                instagram_account_id: config?.instagram_account_id || '',
                account_name: config?.account_name || '',
                page_access_token: config?.page_access_token || '',
                page_id: config?.page_id || ''
              }
            });
          } else if (integration.channel === 'whatsapp') {
            setWhatsappConfig({
              id: integration.id,
              channel: 'whatsapp',
              is_connected: integration.is_connected || false,
              account_id: integration.account_id || '',
              workspace_id: workspaceId,
              config: {
                phone_number_id: config?.phone_number_id || '',
                phone_number: config?.phone_number || config?.display_phone_number || '',
                access_token: config?.access_token || '',
                wa_id: config?.wa_id || '',
                display_phone_number: config?.display_phone_number || ''
              }
            });
          }
        });
      }
    } catch (error) {
      console.error('Error loading channel configs:', error);
      toast.error('فشل في تحميل إعدادات القنوات');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (channelConfig: ChannelConfig) => {
    setSaving(channelConfig.channel);
    try {
      const dataToSave = {
        channel: channelConfig.channel,
        is_connected: channelConfig.is_connected,
        account_id: channelConfig.account_id || channelConfig.config.page_id || channelConfig.config.instagram_account_id || channelConfig.config.phone_number_id || '',
        workspace_id: workspaceId,
        config: channelConfig.config,
        updated_at: new Date().toISOString()
      };

      if (channelConfig.id) {
        // Update existing
        const { error } = await supabase
          .from('channel_integrations')
          .update(dataToSave)
          .eq('id', channelConfig.id);

        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('channel_integrations')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;

        // Update local state with new ID
        if (channelConfig.channel === 'facebook') {
          setFacebookConfig(prev => ({ ...prev, id: data.id }));
        } else if (channelConfig.channel === 'instagram') {
          setInstagramConfig(prev => ({ ...prev, id: data.id }));
        } else if (channelConfig.channel === 'whatsapp') {
          setWhatsappConfig(prev => ({ ...prev, id: data.id }));
        }
      }

      toast.success(`تم حفظ إعدادات ${getChannelName(channelConfig.channel)} بنجاح`);
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('فشل في حفظ الإعدادات');
    } finally {
      setSaving(null);
    }
  };

  const getChannelName = (channel: string) => {
    switch (channel) {
      case 'facebook': return 'فيسبوك';
      case 'instagram': return 'إنستغرام';
      case 'whatsapp': return 'واتساب';
      default: return channel;
    }
  };

  const toggleToken = (key: string) => {
    setShowTokens(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Facebook Messenger */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Facebook className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold">فيسبوك ماسنجر</h3>
              <p className="text-sm text-muted-foreground">ربط صفحة فيسبوك لاستقبال الرسائل</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={facebookConfig.is_connected ? "default" : "secondary"} className="gap-1">
              {facebookConfig.is_connected ? (
                <>
                  <CheckCircle className="w-3 h-3" />
                  متصل
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3" />
                  غير متصل
                </>
              )}
            </Badge>
            <Switch
              checked={facebookConfig.is_connected}
              onCheckedChange={(checked) => setFacebookConfig(prev => ({ ...prev, is_connected: checked }))}
            />
          </div>
        </div>
        
        <Separator className="mb-4" />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Page ID</Label>
            <Input
              placeholder="أدخل Page ID"
              value={facebookConfig.config.page_id || ''}
              onChange={(e) => setFacebookConfig(prev => ({
                ...prev,
                account_id: e.target.value,
                config: { ...prev.config, page_id: e.target.value }
              }))}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label>اسم الصفحة</Label>
            <Input
              placeholder="اسم صفحة فيسبوك"
              value={facebookConfig.config.page_name || ''}
              onChange={(e) => setFacebookConfig(prev => ({
                ...prev,
                config: { ...prev.config, page_name: e.target.value }
              }))}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Page Access Token</Label>
              <Button variant="ghost" size="sm" onClick={() => toggleToken('fb_token')}>
                {showTokens['fb_token'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <Input
              type={showTokens['fb_token'] ? 'text' : 'password'}
              placeholder="أدخل Page Access Token"
              value={facebookConfig.config.page_access_token || ''}
              onChange={(e) => setFacebookConfig(prev => ({
                ...prev,
                config: { ...prev.config, page_access_token: e.target.value }
              }))}
              dir="ltr"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={() => saveConfig(facebookConfig)} disabled={saving === 'facebook'}>
            {saving === 'facebook' ? <RefreshCw className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
            حفظ
          </Button>
        </div>
      </Card>

      {/* Instagram */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/10 to-pink-500/10">
              <Instagram className="w-5 h-5 text-pink-500" />
            </div>
            <div>
              <h3 className="font-semibold">إنستغرام</h3>
              <p className="text-sm text-muted-foreground">ربط حساب إنستغرام للأعمال</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={instagramConfig.is_connected ? "default" : "secondary"} className="gap-1">
              {instagramConfig.is_connected ? (
                <>
                  <CheckCircle className="w-3 h-3" />
                  متصل
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3" />
                  غير متصل
                </>
              )}
            </Badge>
            <Switch
              checked={instagramConfig.is_connected}
              onCheckedChange={(checked) => setInstagramConfig(prev => ({ ...prev, is_connected: checked }))}
            />
          </div>
        </div>
        
        <Separator className="mb-4" />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Instagram Account ID</Label>
            <Input
              placeholder="أدخل Instagram Account ID"
              value={instagramConfig.config.instagram_account_id || ''}
              onChange={(e) => setInstagramConfig(prev => ({
                ...prev,
                account_id: e.target.value,
                config: { ...prev.config, instagram_account_id: e.target.value }
              }))}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label>اسم الحساب</Label>
            <Input
              placeholder="@username"
              value={instagramConfig.config.account_name || ''}
              onChange={(e) => setInstagramConfig(prev => ({
                ...prev,
                config: { ...prev.config, account_name: e.target.value }
              }))}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label>Page ID (المرتبط)</Label>
            <Input
              placeholder="Facebook Page ID المرتبط"
              value={instagramConfig.config.page_id || ''}
              onChange={(e) => setInstagramConfig(prev => ({
                ...prev,
                config: { ...prev.config, page_id: e.target.value }
              }))}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Page Access Token</Label>
              <Button variant="ghost" size="sm" onClick={() => toggleToken('ig_token')}>
                {showTokens['ig_token'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <Input
              type={showTokens['ig_token'] ? 'text' : 'password'}
              placeholder="أدخل Page Access Token"
              value={instagramConfig.config.page_access_token || ''}
              onChange={(e) => setInstagramConfig(prev => ({
                ...prev,
                config: { ...prev.config, page_access_token: e.target.value }
              }))}
              dir="ltr"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={() => saveConfig(instagramConfig)} disabled={saving === 'instagram'}>
            {saving === 'instagram' ? <RefreshCw className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
            حفظ
          </Button>
        </div>
      </Card>

      {/* WhatsApp */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <MessageSquare className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h3 className="font-semibold">واتساب بيزنس</h3>
              <p className="text-sm text-muted-foreground">ربط WhatsApp Business API</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={whatsappConfig.is_connected ? "default" : "secondary"} className="gap-1">
              {whatsappConfig.is_connected ? (
                <>
                  <CheckCircle className="w-3 h-3" />
                  متصل
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3" />
                  غير متصل
                </>
              )}
            </Badge>
            <Switch
              checked={whatsappConfig.is_connected}
              onCheckedChange={(checked) => setWhatsappConfig(prev => ({ ...prev, is_connected: checked }))}
            />
          </div>
        </div>
        
        <Separator className="mb-4" />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Phone Number ID</Label>
            <Input
              placeholder="أدخل Phone Number ID"
              value={whatsappConfig.config.phone_number_id || ''}
              onChange={(e) => setWhatsappConfig(prev => ({
                ...prev,
                account_id: e.target.value,
                config: { ...prev.config, phone_number_id: e.target.value }
              }))}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label>رقم الهاتف</Label>
            <Input
              placeholder="+966XXXXXXXXX"
              value={whatsappConfig.config.display_phone_number || whatsappConfig.config.phone_number || ''}
              onChange={(e) => setWhatsappConfig(prev => ({
                ...prev,
                config: { ...prev.config, display_phone_number: e.target.value, phone_number: e.target.value }
              }))}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp Business Account ID</Label>
            <Input
              placeholder="أدخل WA Business Account ID"
              value={whatsappConfig.config.wa_id || ''}
              onChange={(e) => setWhatsappConfig(prev => ({
                ...prev,
                config: { ...prev.config, wa_id: e.target.value }
              }))}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Access Token</Label>
              <Button variant="ghost" size="sm" onClick={() => toggleToken('wa_token')}>
                {showTokens['wa_token'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <Input
              type={showTokens['wa_token'] ? 'text' : 'password'}
              placeholder="أدخل Access Token"
              value={whatsappConfig.config.access_token || ''}
              onChange={(e) => setWhatsappConfig(prev => ({
                ...prev,
                config: { ...prev.config, access_token: e.target.value }
              }))}
              dir="ltr"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={() => saveConfig(whatsappConfig)} disabled={saving === 'whatsapp'}>
            {saving === 'whatsapp' ? <RefreshCw className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
            حفظ
          </Button>
        </div>
      </Card>
    </div>
  );
};
