# Indexa os PDFs da pasta de contratos (só nomes, tamanhos e datas — não lê o conteúdo).
# Gera work/z_index.csv, que o scan-archive.py e o validate-match.py usam.
#
# Uso:  powershell -File scripts/contracts-tools/index-archive.ps1
#
# Ajuste $root se a pasta de rede estiver mapeada em outra letra.
$root = "Z:\GERAL\CONTRATOS ESCANEADOS\CONTRATOS SCANEADOS"
$work = Join-Path $PSScriptRoot "work"
New-Item -ItemType Directory -Force $work | Out-Null

$all = foreach ($c in "AMBIENTEC","BIOCOLETAS","COLEFAR","COLEMAX","COLENORTE") {
  Get-ChildItem -LiteralPath (Join-Path $root $c) -Recurse -File -Filter *.pdf -ErrorAction SilentlyContinue |
    ForEach-Object { [pscustomobject]@{
      Empresa = $c
      Nome    = $_.Name
      Rel     = $_.FullName.Substring($root.Length + 1)
      Len     = $_.Length
      Data    = $_.LastWriteTime
    } }
}
$all | Export-Csv -LiteralPath (Join-Path $work "z_index.csv") -NoTypeInformation -Encoding UTF8
"$($all.Count) PDFs indexados em $work\z_index.csv"
