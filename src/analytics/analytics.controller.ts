import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) {}

    @Get('dashboard')
    async getDashboard(@Query('from') from?: string, @Query('to') to?: string) {
        return this.analyticsService.getDashboardData({ from, to });
    }

    @Get('export/csv')
    async exportCsv(
        @Res() res: Response,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        const csvData = await this.analyticsService.generateOrdersCsv({
            from,
            to,
        });
        const filename = `sales_report_${new Date().toISOString().slice(0, 10)}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`,
        );
        return res.send(csvData);
    }
}
