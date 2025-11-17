import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Tag, CheckCircle, UserCheck, TrendingUp, AlertCircle } from "lucide-react";

export default function Dashboard() {
  // TODO: Replace with real API calls
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/stats"],
    // Placeholder data for now
    enabled: false,
  });

  const mockStats = {
    totalUsers: 1234,
    activeDiscounts: 567,
    redemptionsToday: 89,
    pendingCashiers: 3,
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-32 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-dashboard">Главная</h1>
        <p className="text-muted-foreground">
          Обзор системы лояльности Мармеладный дворик
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover-elevate" data-testid="card-stat-users">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Всего пользователей</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-users">
              {mockStats.totalUsers.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <span data-testid="text-users-trend">+12% за месяц</span>
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-stat-discounts">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Активные скидки</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active-discounts">
              {mockStats.activeDiscounts.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Не погашенные коды
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-stat-redemptions">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Погашено сегодня</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-redemptions-today">
              {mockStats.redemptionsToday}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <span data-testid="text-redemptions-trend">+24% vs вчера</span>
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-stat-pending">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ожидают подтверждения</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2" data-testid="stat-pending-cashiers">
              {mockStats.pendingCashiers}
              {mockStats.pendingCashiers > 0 && (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Новые кассиры
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-recent-activity">
          <CardHeader>
            <CardTitle>Последняя активность</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 rounded-md bg-muted/50" data-testid="activity-redemption">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">Код АБВ1234 погашен</p>
                  <p className="text-xs text-muted-foreground">5 минут назад • Кассир Иван</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 rounded-md bg-muted/50" data-testid="activity-registration">
                <Users className="h-5 w-5 text-primary" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">Новый пользователь зарегистрирован</p>
                  <p className="text-xs text-muted-foreground">12 минут назад • Источник: Instagram</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 rounded-md bg-muted/50" data-testid="activity-discount">
                <Tag className="h-5 w-5 text-blue-600" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">Скидка выдана за подписку</p>
                  <p className="text-xs text-muted-foreground">25 минут назад • @username</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-quick-actions">
          <CardHeader>
            <CardTitle>Быстрые действия</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <button 
              className="w-full p-4 text-left rounded-md border hover-elevate active-elevate-2"
              data-testid="button-quick-broadcast"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Tag className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Создать рассылку</p>
                  <p className="text-xs text-muted-foreground">Отправить сообщение пользователям</p>
                </div>
              </div>
            </button>
            <button 
              className="w-full p-4 text-left rounded-md border hover-elevate active-elevate-2"
              data-testid="button-quick-campaign"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Tag className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Создать кампанию</p>
                  <p className="text-xs text-muted-foreground">Новая реферальная ссылка</p>
                </div>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
