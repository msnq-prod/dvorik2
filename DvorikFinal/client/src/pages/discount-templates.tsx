import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function DiscountTemplates() {
  const { data: templates, isLoading } = useQuery({
    queryKey: ["/api/discount-templates"],
    enabled: false,
  });

  const mockTemplates = [
    {
      id: 1,
      name: "subscription_default",
      displayName: "Скидка за подписку",
      value: "10.00",
      valueType: "percent",
      durationDays: 30,
      event: "subscription",
      usageType: "single",
      usageCount: 245,
      isActive: true,
    },
    {
      id: 2,
      name: "birthday_default",
      displayName: "Скидка ко дню рождения",
      value: "15.00",
      valueType: "percent",
      durationDays: 7,
      event: "birthday",
      usageType: "single",
      usageCount: 89,
      isActive: true,
    },
    {
      id: 3,
      name: "manual_promo",
      displayName: "Промо-акция",
      value: "500.00",
      valueType: "fixed",
      durationDays: 14,
      event: "manual",
      usageType: "single",
      usageCount: 12,
      isActive: false,
    },
  ];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-templates">Шаблоны скидок</h1>
          <p className="text-muted-foreground">
            Настройка типов скидок и условий их выдачи
          </p>
        </div>
        <Button data-testid="button-create-template">
          <Plus className="h-4 w-4 mr-2" />
          Создать шаблон
        </Button>
      </div>

      {mockTemplates.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <Tag className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">Нет шаблонов скидок</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Создайте первый шаблон скидки для автоматической выдачи промокодов
              </p>
            </div>
            <Button data-testid="button-create-first-template">
              <Plus className="h-4 w-4 mr-2" />
              Создать первый шаблон
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mockTemplates.map((template) => (
            <Card key={template.id} className="hover-elevate" data-testid={`card-template-${template.id}`}>
              <CardHeader className="space-y-0 pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1">
                    <CardTitle className="text-lg" data-testid={`text-template-title-${template.id}`}>
                      {template.displayName}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs mt-1" data-testid={`text-template-name-${template.id}`}>
                      {template.name}
                    </CardDescription>
                  </div>
                  {template.isActive ? (
                    <Badge variant="default" data-testid={`badge-status-${template.id}`}>Активен</Badge>
                  ) : (
                    <Badge variant="secondary" data-testid={`badge-status-${template.id}`}>Неактивен</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold" data-testid={`text-value-${template.id}`}>
                    {template.valueType === "percent" ? `${template.value}%` : `${template.value}₽`}
                  </span>
                  <span className="text-sm text-muted-foreground">скидка</span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Тип события:</span>
                    <Badge variant="outline" className="text-xs" data-testid={`badge-event-${template.id}`}>
                      {template.event === "subscription" && "Подписка"}
                      {template.event === "birthday" && "День рождения"}
                      {template.event === "manual" && "Ручная"}
                    </Badge>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Срок действия:</span>
                    <span className="font-medium" data-testid={`text-duration-${template.id}`}>
                      {template.durationDays} дней
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Использований:</span>
                    <span className="font-medium" data-testid={`text-usage-count-${template.id}`}>
                      {template.usageCount}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Тип использования:</span>
                    <span className="font-medium" data-testid={`text-usage-type-${template.id}`}>
                      {template.usageType === "single" ? "Разовая" : "Многоразовая"}
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="gap-2 border-t pt-4">
                <Button variant="outline" size="sm" className="flex-1" data-testid={`button-edit-${template.id}`}>
                  <Edit className="h-3 w-3 mr-1" />
                  Изменить
                </Button>
                <Button variant="outline" size="sm" data-testid={`button-delete-${template.id}`}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
