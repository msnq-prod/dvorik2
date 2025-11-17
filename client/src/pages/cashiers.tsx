import { useQuery } from "@tanstack/react-query";
import { UserCheck, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Cashiers() {
  const { data: cashiers, isLoading } = useQuery({
    queryKey: ["/api/cashiers"],
    enabled: false,
  });

  const mockCashiers = [
    {
      id: 1,
      telegramId: 111222333,
      name: "Иван Кассиров",
      isActive: true,
      approvedByAdmin: "Владимир (owner)",
      createdAt: new Date("2024-01-10"),
      redemptionsCount: 456,
    },
    {
      id: 2,
      telegramId: 444555666,
      name: "Мария Продавцова",
      isActive: true,
      approvedByAdmin: "Владимир (owner)",
      createdAt: new Date("2024-02-15"),
      redemptionsCount: 234,
    },
    {
      id: 3,
      telegramId: 777888999,
      name: "Алексей Новиков",
      isActive: false,
      approvedByAdmin: null,
      createdAt: new Date("2024-03-20"),
      redemptionsCount: 0,
    },
  ];

  const pendingCashiers = mockCashiers.filter((c) => !c.isActive);
  const activeCashiers = mockCashiers.filter((c) => c.isActive);

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
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-cashiers">
          Управление кассирами
        </h1>
        <p className="text-muted-foreground">
          Подтверждение и мониторинг кассиров
        </p>
      </div>

      {pendingCashiers.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5" data-testid="card-pending-cashiers">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold text-destructive" data-testid="text-pending-count">
                    Ожидают подтверждения ({pendingCashiers.length})
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Новые кассиры запросили доступ к системе
                  </p>
                </div>
                <div className="space-y-2">
                  {pendingCashiers.map((cashier) => (
                    <div
                      key={cashier.id}
                      className="flex flex-wrap items-center justify-between gap-4 p-3 bg-background rounded-md border"
                      data-testid={`pending-cashier-${cashier.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium" data-testid={`avatar-pending-${cashier.id}`}>
                          {cashier.name[0]}
                        </div>
                        <div>
                          <div className="font-medium" data-testid={`text-name-pending-${cashier.id}`}>
                            {cashier.name}
                          </div>
                          <div className="text-xs text-muted-foreground" data-testid={`text-telegram-id-pending-${cashier.id}`}>
                            Telegram ID: {cashier.telegramId}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          data-testid={`button-approve-${cashier.id}`}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Подтвердить
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`button-reject-${cashier.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Отклонить
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4 border-b">
          <h3 className="font-semibold" data-testid="text-active-count">
            Активные кассиры ({activeCashiers.length})
          </h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Кассир</TableHead>
              <TableHead>Telegram ID</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Погашений</TableHead>
              <TableHead>Подтвердил</TableHead>
              <TableHead>Дата регистрации</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeCashiers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UserCheck className="h-12 w-12 opacity-50" />
                    <p data-testid="text-no-cashiers">Нет активных кассиров</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              activeCashiers.map((cashier) => (
                <TableRow key={cashier.id} data-testid={`row-cashier-${cashier.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium" data-testid={`avatar-${cashier.id}`}>
                        {cashier.name[0]}
                      </div>
                      <div className="font-medium" data-testid={`text-name-${cashier.id}`}>
                        {cashier.name}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground" data-testid={`text-telegram-id-${cashier.id}`}>
                    {cashier.telegramId}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" data-testid={`badge-status-${cashier.id}`}>
                      Активен
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium" data-testid={`text-redemptions-${cashier.id}`}>
                      {cashier.redemptionsCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground" data-testid={`text-approved-by-${cashier.id}`}>
                    {cashier.approvedByAdmin || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground" data-testid={`text-created-${cashier.id}`}>
                    {cashier.createdAt.toLocaleDateString("ru-RU")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`button-deactivate-${cashier.id}`}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Деактивировать
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
