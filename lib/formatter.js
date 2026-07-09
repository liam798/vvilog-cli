function formatJson(payload) {
  return JSON.stringify(payload, null, 2);
}

function formatText(payload) {
  if (payload === null || payload === undefined) {
    return "";
  }
  if (typeof payload === "string") {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(formatText).filter(Boolean).join("\n");
  }
  if (payload.items && Array.isArray(payload.items)) {
    if (!payload.items.length) {
      return "没有找到记录。";
    }
    return payload.items.map((item) => {
      if (item.description) {
        const marker = item.installed ? " [已安装]" : "";
        return `${item.name}${marker} - ${compact(item.description)}`;
      }
      return String(item.name || item.id || JSON.stringify(item));
    }).join("\n");
  }
  if (payload.ok && payload.message) {
    return payload.message;
  }
  return formatJson(payload);
}

function compact(value, max = 96) {
  const text = String(value || "").split(/\s+/).filter(Boolean).join(" ");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

module.exports = {
  compact,
  formatJson,
  formatText,
};
