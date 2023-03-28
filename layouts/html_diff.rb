require 'nokogiri/diff'
require 'json'

path = ARGV[0]
archive_html = File.open("#{path}_archive/html.html").read
live_html = File.open("#{path}/html.html").read

live_html = "<div><a><p>AHA</p></a></div>"
archive_html = "<div>fff<p>AHA</p></div>"

archive_html = Nokogiri::HTML(archive_html)
live_html = Nokogiri::HTML(live_html)

changes = []
archive_html.diff(live_html, :added => true) do |change,node|
    # puts node.to_html.ljust(10) + node.parent.path
    changes << {:type => node.class, :text => node.to_html}
  end

opts = {
  array_nl: "\n",
  object_nl: "\n",
  indent: '  ',
  space_before: ' ',
  space: ' '
}
json_str = JSON.generate(changes, opts)
File.write("#{path}_archive/diff.json", json_str)

# doc1 = Nokogiri::HTML('<div><p>one</p> two </div>')
# doc2 = Nokogiri::HTML('<div> two <p>one</p></div>')

# doc1.diff(doc2) do |change,node|
#     puts "AHA"
#     puts node.class
#     # puts "#{change} #{node.to_html}".ljust(30) + node.parent.path
#   end