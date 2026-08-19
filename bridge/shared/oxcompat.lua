if not string.startsWith then
    ---Whether `str` begins with `prefix`. Defined only on ox_lib older than v3.39.0, which ships
    ---the string module (hence a live `lib.string`) without the utility functions on it. ox_lib
    ---aliases `lib.string = string`, so filling the gap here repairs every call site at once.
    ---@param str string
    ---@param prefix string
    ---@return boolean
    function string.startsWith(str, prefix)
        return str:sub(1, #prefix) == prefix
    end
end

if not string.endsWith then
    ---Whether `str` ends with `suffix`, an empty one always matching, exactly as ox_lib defines
    ---it. Same pre-v3.39.0 gap as startsWith above.
    ---@param str string
    ---@param suffix string
    ---@return boolean
    function string.endsWith(str, suffix)
        return suffix == '' or str:sub(-#suffix) == suffix
    end
end

local ok, libString = pcall(function() return lib and lib.string end)
if ok and type(libString) == 'table' and libString ~= string then
    if not libString.startsWith then libString.startsWith = string.startsWith end
    if not libString.endsWith   then libString.endsWith   = string.endsWith   end
end
