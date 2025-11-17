import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Save, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Settings() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/settings"],
    enabled: false,
  });

  const [telegramChannel, setTelegramChannel] = useState("@testbydvor");
  const [subscriptionText, setSubscriptionText] = useState(
    "Для получения скидки подпишитесь на наш канал и нажмите 'Проверить подписку'"
  );
  const [broadcastRatePerMinute, setBroadcastRatePerMinute] = useState("25");
  const [broadcastFromChatEnabled, setBroadcastFromChatEnabled] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-settings">
            Настройки
          </h1>
          <p className="text-muted-foreground">
            Конфигурация системы лояльности
          </p>
        </div>
        <Button data-testid="button-save-settings">
          <Save className="h-4 w-4 mr-2" />
          Сохранить изменения
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList data-testid="tabs-list-settings">
          <TabsTrigger value="general" data-testid="tab-general">
            Общие
          </TabsTrigger>
          <TabsTrigger value="messages" data-testid="tab-messages">
            Сообщения
          </TabsTrigger>
          <TabsTrigger value="broadcasts" data-testid="tab-broadcasts">
            Рассылки
          </TabsTrigger>
          <TabsTrigger value="advanced" data-testid="tab-advanced">
            Расширенные
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Настройки Telegram</CardTitle>
              <CardDescription>
                Основные параметры интеграции с Telegram
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="telegram-channel">ID/Username канала</Label>
                <Input
                  id="telegram-channel"
                  value={telegramChannel}
                  onChange={(e) => setTelegramChannel(e.target.value)}
                  placeholder="@channel или -100123456789"
                  data-testid="input-telegram-channel"
                />
                <p className="text-xs text-muted-foreground">
                  Канал для проверки подписки пользователей
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subscription-text">Текст приглашения к подписке</Label>
                <Textarea
                  id="subscription-text"
                  value={subscriptionText}
                  onChange={(e) => setSubscriptionText(e.target.value)}
                  rows={3}
                  data-testid="textarea-subscription-text"
                />
                <p className="text-xs text-muted-foreground">
                  Сообщение, которое увидят пользователи при первом запуске бота
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Форматирование кодов</CardTitle>
              <CardDescription>
                Настройки генерации промокодов
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 border rounded-md">
                <div className="space-y-1">
                  <Label>Формат кода</Label>
                  <p className="text-sm text-muted-foreground">
                    3 кириллические буквы + 4 цифры (АБВ1234)
                  </p>
                </div>
                <Badge variant="secondary" className="font-mono" data-testid="badge-code-format">
                  АБВ1234
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Формат промокодов жёстко задан для согласованности системы
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Шаблоны сообщений</CardTitle>
              <CardDescription>
                Текст автоматических уведомлений
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="birthday-message">Поздравление с днём рождения</Label>
                <Textarea
                  id="birthday-message"
                  defaultValue="🎉 С днём рождения! Мы приготовили для вас особую скидку!"
                  rows={3}
                  data-testid="textarea-birthday-message"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discount-issued">Скидка выдана</Label>
                <Textarea
                  id="discount-issued"
                  defaultValue="✅ Ваша скидка готова! Код: {code}\nДействует до: {expires_at}"
                  rows={3}
                  data-testid="textarea-discount-issued"
                />
                <p className="text-xs text-muted-foreground">
                  Доступные переменные: {"{code}"}, {"{expires_at}"}, {"{discount_value}"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="discount-redeemed">Скидка использована</Label>
                <Textarea
                  id="discount-redeemed"
                  defaultValue="Ваш код {code} был успешно применён! Спасибо за покупку! 💚"
                  rows={2}
                  data-testid="textarea-discount-redeemed"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="broadcasts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Лимиты рассылок</CardTitle>
              <CardDescription>
                Настройка скорости отправки сообщений
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rate-per-minute">Сообщений в минуту</Label>
                <Input
                  id="rate-per-minute"
                  type="number"
                  value={broadcastRatePerMinute}
                  onChange={(e) => setBroadcastRatePerMinute(e.target.value)}
                  data-testid="input-rate-per-minute"
                />
                <p className="text-xs text-muted-foreground">
                  Рекомендуемое значение: 25-30 для избежания лимитов Telegram
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 p-4 border rounded-md">
                <div className="space-y-1">
                  <Label htmlFor="chat-broadcast">Рассылка через чат</Label>
                  <p className="text-sm text-muted-foreground">
                    Разрешить админам отправлять рассылки напрямую через бота
                  </p>
                </div>
                <Switch
                  id="chat-broadcast"
                  checked={broadcastFromChatEnabled}
                  onCheckedChange={setBroadcastFromChatEnabled}
                  data-testid="switch-chat-broadcast"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Расширенные настройки</CardTitle>
              <CardDescription>
                Дополнительная конфигурация системы
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 border rounded-md">
                <div className="space-y-1">
                  <Label>Часовой пояс</Label>
                  <p className="text-sm text-muted-foreground">
                    Asia/Vladivostok (UTC+10)
                  </p>
                </div>
                <Badge variant="secondary" data-testid="badge-timezone">Владивосток</Badge>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cache-ttl">Кэш проверки подписки (секунды)</Label>
                <Input
                  id="cache-ttl"
                  type="number"
                  defaultValue="60"
                  data-testid="input-cache-ttl"
                />
                <p className="text-xs text-muted-foreground">
                  Минимальный интервал между проверками подписки одного пользователя
                </p>
              </div>

              <div className="p-4 bg-muted/50 rounded-md space-y-2">
                <div className="flex items-center gap-2">
                  <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Системная информация</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Версия API:</span>
                    <span className="font-mono" data-testid="text-api-version">1.0.0</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">База данных:</span>
                    <span className="font-mono" data-testid="text-database-type">PostgreSQL</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Очереди:</span>
                    <span className="font-mono" data-testid="text-queue-type">Bull/Redis</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Статус:</span>
                    <Badge variant="outline" className="text-xs" data-testid="badge-system-status">
                      Работает
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
