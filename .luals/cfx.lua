---@meta

---@class vector2
---@field x number
---@field y number
---@operator add(vector2): vector2
---@operator sub(vector2): vector2
---@operator mul(number): vector2
---@operator div(number): vector2
---@operator unm: vector2
---@operator len: number

---@class vector3
---@field x number
---@field y number
---@field z number
---@field xy vector2
---@operator add(vector3): vector3
---@operator sub(vector3): vector3
---@operator mul(number): vector3
---@operator div(number): vector3
---@operator unm: vector3
---@operator len: number

---@class vector4
---@field x number
---@field y number
---@field z number
---@field w number
---@field xy vector2
---@field xyz vector3
---@operator add(vector4): vector4
---@operator sub(vector4): vector4
---@operator mul(number): vector4
---@operator div(number): vector4
---@operator unm: vector4
---@operator len: number

---@param x number
---@param y number
---@return vector2
function vector2(x, y) end

---@param x number
---@param y number
---@param z number
---@return vector3
function vector3(x, y, z) end

---@param x number
---@param y number
---@param z number
---@param w number
---@return vector4
function vector4(x, y, z, w) end

---@param x number
---@param y number
---@return vector2
function vec2(x, y) end

---@param x number
---@param y number
---@param z number
---@return vector3
function vec3(x, y, z) end

---@param x number
---@param y number
---@param z number
---@param w number
---@return vector4
function vec4(x, y, z, w) end
