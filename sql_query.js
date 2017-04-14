///<reference path="../../../headers/common.d.ts" />
System.register(["lodash", "app/core/utils/datemath", "moment", "./scanner"], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var lodash_1, dateMath, moment_1, scanner_1, durationSplitRegexp, SqlQuery;
    return {
        setters: [
            function (lodash_1_1) {
                lodash_1 = lodash_1_1;
            },
            function (dateMath_1) {
                dateMath = dateMath_1;
            },
            function (moment_1_1) {
                moment_1 = moment_1_1;
            },
            function (scanner_1_1) {
                scanner_1 = scanner_1_1;
            }
        ],
        execute: function () {///<reference path="../../../headers/common.d.ts" />
            durationSplitRegexp = /(\d+)(ms|s|m|h|d|w|M|y)/;
            SqlQuery = (function () {
                /** @ngInject */
                function SqlQuery(target, templateSrv, options) {
                    this.target = target;
                    this.templateSrv = templateSrv;
                    this.options = options;
                    target.resultFormat = 'time_series';
                    target.tags = target.tags || [];
                    target.targetLists = target.targetLists || [[
                            { type: 'field', params: ['*'] },
                            { type: 'count', params: [] },
                        ]];
                }
                SqlQuery.prototype.replace = function (options) {
                    var query = this.target.query, scanner = new scanner_1.default(query), from = SqlQuery.convertTimestamp(this.options.range.from), to = SqlQuery.convertTimestamp(this.options.range.to), timeFilter = SqlQuery.getTimeFilter(this.options.rangeRaw.to === 'now'), i = this.templateSrv.replace(this.target.interval, options.scopedVars) || options.interval, interval = SqlQuery.convertInterval(i, this.target.intervalFactor || 1);
                    var ast;
                    try {
                        ast = scanner.toAST();
                        if (ast.hasOwnProperty('$columns') && !lodash_1.default.isEmpty(ast.$columns)) {
                            query = SqlQuery.columns(query);
                        }
                        else if (ast.hasOwnProperty('$rateColumns') && !lodash_1.default.isEmpty(ast.$rateColumns)) {
                            query = SqlQuery.rateColumns(query);
                        }
                        else if (ast.hasOwnProperty('$rate') && !lodash_1.default.isEmpty(ast.$rate)) {
                            query = SqlQuery.rate(query, ast);
                        }
                    }
                    catch (err) {
                        console.log("Parse error: ", err);
                    }
                    query = this.templateSrv.replace(query, options.scopedVars, SqlQuery.interpolateQueryExpr);
                    this.target.rawQuery = query
                        .replace(/\$timeSeries/g, '(intDiv(toUInt32($dateTimeCol), $interval) * $interval) * 1000')
                        .replace(/\$timeFilter/g, timeFilter)
                        .replace(/\$table/g, this.target.database + '.' + this.target.table)
                        .replace(/\$from/g, from)
                        .replace(/\$to/g, to)
                        .replace(/\$timeCol/g, this.target.dateColDataType)
                        .replace(/\$dateTimeCol/g, this.target.dateTimeColDataType)
                        .replace(/\$interval/g, interval)
                        .replace(/(?:\r\n|\r|\n)/g, ' ');
                    return this.target.rawQuery;
                };
                // $columns(query)
                SqlQuery.columns = function (query) {
                    if (query.slice(0, 9) === '$columns(') {
                        var fromIndex = SqlQuery._fromIndex(query);
                        var args = query.slice(9, fromIndex)
                            .trim() // rm spaces
                            .slice(0, -1), // cut ending brace
                        scanner = new scanner_1.default(args), ast = scanner.toAST();
                        if (ast.root.length !== 2) {
                            throw { message: 'Amount of arguments must equal 2 for $columns func. Parsed arguments are: ' + ast.root.join(', ') };
                        }
                        query = SqlQuery._columns(ast.root[0], ast.root[1], query.slice(fromIndex));
                    }
                    return query;
                };
                SqlQuery._columns = function (key, value, fromQuery) {
                    if (key.slice(-1) === ')' || value.slice(-1) === ')') {
                        throw { message: 'Some of passed arguments are without aliases: ' + key + ', ' + value };
                    }
                    var keyAlias = key.trim().split(' ').pop(), valueAlias = value.trim().split(' ').pop(), havingIndex = fromQuery.toLowerCase().indexOf('having'), having = "";
                    if (havingIndex !== -1) {
                        having = fromQuery.slice(havingIndex, fromQuery.length);
                        fromQuery = fromQuery.slice(0, havingIndex);
                    }
                    fromQuery = SqlQuery._applyTimeFilter(fromQuery);
                    return 'SELECT ' +
                        't' +
                        ', groupArray((' + keyAlias + ', ' + valueAlias + ')) as groupArr' +
                        ' FROM (' +
                        ' SELECT $timeSeries as t' +
                        ', ' + key +
                        ', ' + value + ' ' +
                        fromQuery +
                        ' GROUP BY t, ' + keyAlias +
                        ' ' + having +
                        ' ORDER BY t' +
                        ') ' +
                        'GROUP BY t ' +
                        'ORDER BY t';
                };
                // $rateColumns(query)
                SqlQuery.rateColumns = function (query) {
                    if (query.slice(0, 13) === '$rateColumns(') {
                        var fromIndex = SqlQuery._fromIndex(query);
                        var args = query.slice(13, fromIndex)
                            .trim() // rm spaces
                            .slice(0, -1), // cut ending brace
                        scanner = new scanner_1.default(args), ast = scanner.toAST();
                        if (ast.root.length !== 2) {
                            throw { message: 'Amount of arguments must equal 2 for $columns func. Parsed arguments are: ' + ast.root.join(', ') };
                        }
                        query = SqlQuery._columns(ast.root[0], ast.root[1], query.slice(fromIndex));
                        query = 'SELECT t' +
                            ', arrayMap(a -> (a.1, a.2/runningDifference( t/1000 )), groupArr)' +
                            ' FROM (' +
                            query +
                            ')';
                    }
                    return query;
                };
                // $rate(query)
                SqlQuery.rate = function (query, ast) {
                    if (query.slice(0, 6) === '$rate(') {
                        var fromIndex = SqlQuery._fromIndex(query);
                        if (ast.$rate.length < 1) {
                            throw { message: 'Amount of arguments must be > 0 for $rate func. Parsed arguments are: ' + ast.$rate.join(', ') };
                        }
                        query = SqlQuery._rate(ast.$rate, query.slice(fromIndex));
                    }
                    return query;
                };
                SqlQuery._fromIndex = function (query) {
                    var fromIndex = query.toLowerCase().indexOf('from');
                    if (fromIndex === -1) {
                        throw { message: 'Could not find FROM-statement at: ' + query };
                    }
                    return fromIndex;
                };
                SqlQuery._rate = function (args, fromQuery) {
                    var aliases = [];
                    lodash_1.default.each(args, function (arg) {
                        if (arg.slice(-1) === ')') {
                            throw { message: 'Argument "' + arg + '" cant be used without alias' };
                        }
                        aliases.push(arg.trim().split(' ').pop());
                    });
                    var rateColums = [];
                    lodash_1.default.each(aliases, function (a) {
                        rateColums.push(a + '/runningDifference(t/1000) ' + a + 'Rate');
                    });
                    fromQuery = SqlQuery._applyTimeFilter(fromQuery);
                    return 'SELECT ' + '' +
                        't' +
                        ', ' + rateColums.join(',') +
                        ' FROM (' +
                        ' SELECT $timeSeries as t' +
                        ', ' + args.join(',') +
                        ' ' + fromQuery +
                        ' GROUP BY t' +
                        ' ORDER BY t' +
                        ')';
                };
                SqlQuery._applyTimeFilter = function (query) {
                    if (query.toLowerCase().indexOf('where') !== -1) {
                        query = query.replace(/where/i, 'WHERE $timeFilter AND ');
                    }
                    else {
                        query += ' WHERE $timeFilter';
                    }
                    return query;
                };
                SqlQuery.getTimeFilter = function (isToNow) {
                    if (isToNow) {
                        return '$timeCol >= toDate($from) AND $dateTimeCol >= toDateTime($from)';
                    }
                    else {
                        return '$timeCol BETWEEN toDate($from) AND toDate($to) AND $dateTimeCol BETWEEN toDateTime($from) AND toDateTime($to)';
                    }
                };
                // date is a moment object
                SqlQuery.convertTimestamp = function (date) {
                    //return date.format("'Y-MM-DD HH:mm:ss'")
                    if (lodash_1.default.isString(date)) {
                        date = dateMath.parse(date, true);
                    }
                    return Math.ceil(date.valueOf() / 1000);
                };
                SqlQuery.convertInterval = function (interval, intervalFactor) {
                    var m = interval.match(durationSplitRegexp);
                    var dur = moment_1.default.duration(parseInt(m[1]), m[2]);
                    var sec = dur.asSeconds();
                    if (sec < 1) {
                        sec = 1;
                    }
                    return Math.ceil(sec * intervalFactor);
                };
                SqlQuery.interpolateQueryExpr = function (value, variable, defaultFormatFn) {
                    // if no multi or include all do not regexEscape
                    if (!variable.multi && !variable.includeAll) {
                        return value;
                    }
                    if (typeof value === 'string') {
                        return SqlQuery.clickhouseEscape(value, variable);
                    }
                    var escapedValues = lodash_1.default.map(value, function (v) {
                        return SqlQuery.clickhouseEscape(v, variable);
                    });
                    return escapedValues.join(',');
                };
                SqlQuery.clickhouseEscape = function (value, variable) {
                    var isDigit = true;
                    // if at least one of options is not digit
                    lodash_1.default.each(variable.options, function (opt) {
                        if (opt.value === '$__all') {
                            return true;
                        }
                        if (!opt.value.match(/^\d+$/) && !opt.value.match(/^\d+\.\d+$/)) {
                            isDigit = false;
                            return false;
                        }
                    });
                    if (isDigit) {
                        return value;
                    }
                    else {
                        return "'" + value.replace(/[\\']/g, '\\$&') + "'";
                    }
                };
                return SqlQuery;
            }());
            SqlQuery.REGEX_COLUMNS = /(?:\s*(?=\w+\.|.*as\s+|distinct\s+|)(\*|\w+|(?:,|\s+)|\w+\([a-z*]+\))(?=\s*(?=,|$)))/ig;
            exports_1("default", SqlQuery);
        }
    };
});
//# sourceMappingURL=sql_query.js.map