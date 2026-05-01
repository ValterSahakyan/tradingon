"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitSchema1700000000000 = void 0;
var InitSchema1700000000000 = /** @class */ (function () {
    function InitSchema1700000000000() {
    }
    InitSchema1700000000000.prototype.up = function (queryRunner) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, queryRunner.query("\n      CREATE TABLE IF NOT EXISTS trade_logs (\n        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n        token VARCHAR(20) NOT NULL,\n        direction VARCHAR(10) NOT NULL,\n        \"entryPrice\" NUMERIC(18,8) NOT NULL,\n        \"exitPrice\" NUMERIC(18,8),\n        margin NUMERIC(10,4) NOT NULL,\n        notional NUMERIC(10,4) NOT NULL,\n        leverage INT NOT NULL,\n        \"patternsFired\" TEXT NOT NULL,\n        score INT NOT NULL,\n        \"entryTime\" BIGINT NOT NULL,\n        \"exitTime\" BIGINT,\n        \"durationMinutes\" INT,\n        \"exitReason\" VARCHAR(20),\n        \"pnlUsd\" NUMERIC(10,4),\n        \"pnlPercent\" NUMERIC(10,4),\n        \"fundingPaid\" NUMERIC(10,6),\n        \"marketCondition\" VARCHAR(20) NOT NULL,\n        \"fundingRateAtEntry\" NUMERIC(10,4),\n        \"tp1Price\" NUMERIC(18,8),\n        \"tp2Price\" NUMERIC(18,8),\n        \"stopPrice\" NUMERIC(18,8),\n        \"tp1Hit\" BOOLEAN DEFAULT FALSE,\n        \"tp2Hit\" BOOLEAN DEFAULT FALSE,\n        \"createdAt\" TIMESTAMP DEFAULT NOW()\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_trade_logs_token_entry ON trade_logs (token, \"entryTime\");\n      CREATE INDEX IF NOT EXISTS idx_trade_logs_exit ON trade_logs (\"exitTime\");\n\n      CREATE TABLE IF NOT EXISTS daily_stats (\n        id SERIAL PRIMARY KEY,\n        date DATE UNIQUE NOT NULL,\n        \"totalTrades\" INT DEFAULT 0,\n        wins INT DEFAULT 0,\n        losses INT DEFAULT 0,\n        \"totalPnlUsd\" NUMERIC(10,4) DEFAULT 0,\n        \"totalFundingPaid\" NUMERIC(10,4) DEFAULT 0,\n        \"avgWinUsd\" NUMERIC(10,4),\n        \"avgLossUsd\" NUMERIC(10,4),\n        \"winRatePct\" NUMERIC(5,2),\n        \"startingCapital\" NUMERIC(10,4),\n        \"endingCapital\" NUMERIC(10,4),\n        \"circuitBreakerTriggered\" BOOLEAN DEFAULT FALSE,\n        \"circuitBreakerReason\" TEXT\n      );\n    ")];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    InitSchema1700000000000.prototype.down = function (queryRunner) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, queryRunner.query("DROP TABLE IF EXISTS trade_logs")];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, queryRunner.query("DROP TABLE IF EXISTS daily_stats")];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return InitSchema1700000000000;
}());
exports.InitSchema1700000000000 = InitSchema1700000000000;
