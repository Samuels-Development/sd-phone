local H = { passed = 0, failed = 0 }

---A stub migrate store: records every insert call so tests can assert on the rows.
---`tables` holds lb-shaped tables; `foreign` holds tables that exist under an lb name but carry
---sd-phone's own shape, which is what `lbSource` has to reject.
function H.newStore()
    local s = { calls = {}, tables = {}, foreign = {}, lb = {} }
    s.tableExists = function(name) return s.tables[name] == true end
    s.lbTable = function(name) return 'phone_' .. name end
    s.lbSource = function(name, marker)
        local full = 'phone_' .. name
        local rescued = full .. '_lb'
        if s.tables[rescued] then return rescued end
        -- Not `marker and nil or full`: nil is falsy, so that idiom always yields full.
        if s.foreign[full] then
            if marker then return nil end
            return full
        end
        if not s.tables[full] then return nil end
        return full
    end
    s.decodeJson = function(v)
        if type(v) == 'table' then return v end
        return {}
    end
    s.encodeJson = function(t)
        if not t or next(t) == nil then return nil end
        return 'json:' .. tostring(#t)
    end
    s.record = function(key, rows)
        s.calls[key] = s.calls[key] or {}
        for i = 1, #rows do s.calls[key][#s.calls[key] + 1] = rows[i] end
    end
    return s
end

---Loads a porter module with `server.migrate.store` and `server.util` mocked.
function H.load(path, storeMock, utilMock)
    package.loaded['server.migrate.store'] = storeMock
    package.loaded['server.mail.store'] = { reconcileSessions = function() return 0, 0 end }
    package.loaded['server.util'] = utilMock or {
        truthy = function(v) return v == true or v == 1 or v == '1' end,
        trim   = function(v) return (tostring(v or ''):gsub('^%s+', ''):gsub('%s+$', '')) end,
        newId  = function(n) return ('x'):rep(n or 8) end,
    }
    return dofile(path)
end

function H.eq(actual, expected, label)
    if actual == expected then
        H.passed = H.passed + 1
    else
        H.failed = H.failed + 1
        print(('FAIL %s: expected %s, got %s'):format(label, tostring(expected), tostring(actual)))
    end
end

function H.report()
    print(('%d passed, %d failed'):format(H.passed, H.failed))
    if H.failed > 0 then os.exit(1) end
end

return H
