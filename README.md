
Introduction
================

Widgsock is a javascript library which, combined with a symetric proxy server library, allows one to write web application in the server targeted language.

The programer will never have to write some HTML code nor Javascript or CSS.

Everything is done in the targeted language.

For now the only server library exists in ruby : widgsock-ruby.

Technology
============

Widgsock uses websockets to build a communication channel with the server.

The browser first retrieves a simple HTML5 page which just contains a web area and a link to the Widgsock library.

Widgsock library then connects to the websocket server and all the rest of exchanges are made by this channel.

Ruby implementation
=====================

The ruby implementation of widgsock uses websocket-eventmachine-server to build the websocket server.

How to use it
=====================

First define a simple web page which contains a link to the library (see below). This page (and the targeted library) must be accessible through a web server.

Then run the ruby application which contains the code to run.

cd test
ruby app2.rb

Then point your browser to the HTML page and the application should run in your browser.

Example 
============

HTML page : 
--------------

The only HTML code the programmer has to write is to define an area (or several areas) in a web page and apply the widgsock library on it.


<!DOCTYPE html>
<header>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="css/widgsock.css" type="text/css" media="screen">
  <script language='javascript' src='http://code.jquery.com/jquery-2.1.4.js' type='text/javascript'></script>
  <script language='javascript' src='libjs/widgsock.js' type='text/javascript'></script>
<script>
  $(function() {  widgsock.run("first");  });  
</script>
</header>
<body>
  <div id="first" style="width:900px;height:600px;position:relative;">
   </div>
</body>
</html>

It is possible to define several zones on the page and target specific programs on those zones.

  $(function() {
    widgsock.run("first");
    widgsock.run("second");
  });  


Ruby application :
-------------------

The server builds an widgsock-app object and passes it to the loop which contains the code for application.

Widgsock::register("first") do |app|
	... application
end
Widgsock::run

Widsock-ruby impements some widgets which allow the programer to draw the sreens of application. 

Everything is done in ruby language.

Example : for drawing a select widget on the screen :

  arr = {"val1"=>"first value", "val2"=>"second value"}
  w = app.widget(:type=>"Select", :values=>arr)
  w.display(:x=>0, :y=>0)

For now all the widgets are displayed in absolute mode (x,y,w,h) in the area of the application.

Each widget allows the programer to retrieve events which can occur on it :

w.on("change") do
	puts "w.val=" + w.val
end

Widgets documentation
=====================

Select widget
------------------

MultiSelect widget
------------------

FileUpload widget
------------------

Menu widget
------------------

Table widget
------------------

Input widget
------------------

Textarea widget
------------------

Button widget
------------------

Canvas widget
------------------

Iframe widget
------------------

Text widget
------------------

Img widget
------------------

Tabs widget
------------------






