
/* compile with:
 * gcc -o tags tags.c `pkg-config --cflags --libs gstreamer-0.10` */
#include <gst/gst.h>
#include <glib.h>
#include <string.h>

static void
print_one_tag (const GstTagList * list, const gchar * tag, gpointer user_data)
{
  int i, num;

  num = gst_tag_list_get_tag_size (list, tag);
  for (i = 0; i < num; ++i) {
    const GValue *val;

    /* Note: when looking for specific tags, use the g_tag_list_get_xyz() API,
     * we only use the GValue approach here because it is more generic */
    val = gst_tag_list_get_value_index (list, tag, i);
    if (G_VALUE_HOLDS_STRING (val)) {
      g_print ("\t%20s : %s\n", tag, g_value_get_string (val));
    } else if (G_VALUE_HOLDS_UINT (val)) {
      g_print ("\t%20s : %u\n", tag, g_value_get_uint (val));
    } else if (G_VALUE_HOLDS_DOUBLE (val)) {
      g_print ("\t%20s : %g\n", tag, g_value_get_double (val));
    } else if (G_VALUE_HOLDS_BOOLEAN (val)) {
      g_print ("\t%20s : %s\n", tag,
          (g_value_get_boolean (val)) ? "true" : "false");
    } else if (GST_VALUE_HOLDS_BUFFER (val)) {
      g_print ("\t%20s : buffer of size %u\n", tag,
          GST_BUFFER_SIZE (gst_value_get_buffer (val)));
    } else if (GST_VALUE_HOLDS_DATE (val)) {
      g_print ("\t%20s : date (year=%u,...)\n", tag,
          g_date_get_year (gst_value_get_date (val)));
    } else {
      g_print ("\t%20s : tag of type '%s'\n", tag, G_VALUE_TYPE_NAME (val));
    }
  }
}

static gboolean
bus_call (GstBus     *bus,
          GstMessage *msg,
          gpointer    data)
{
  
  GMainLoop *loop = (GMainLoop *) data;
  GstTagList *tags = NULL;
    

  char *src = GST_MESSAGE_SRC_NAME(msg);
  
  switch (GST_MESSAGE_TYPE (msg)) {
    case GST_MESSAGE_TAG:
      
      gst_message_parse_tag (msg, &tags);
      g_print ("Got tags from element %s:\n", GST_OBJECT_NAME (msg->src));
      gst_tag_list_foreach (tags, print_one_tag, NULL);
      g_print ("\n");
      gst_tag_list_free (tags);
      gst_message_unref (msg);
    break;

  case GST_MESSAGE_EOS:
    g_print ("..[bus].. (%s) :: End of stream\n", src);
    g_main_loop_quit (loop);
    break;

  case GST_MESSAGE_ERROR: {
    gchar  *debug;
    GError *error;
    
    gst_message_parse_error (msg, &error, &debug);
    g_free (debug);
    
    g_printerr ("..[bus].. (%s) :: Error: %s\n", src, error->message);
    g_error_free (error);

    g_main_loop_quit (loop);
    break;
  }
  default: {
    g_print ("..[bus].. %15s :: %-15s\n", src, GST_MESSAGE_TYPE_NAME(msg));
    break;
  }
  }

  return TRUE;
}



static void
on_new_pad (GstElement * dec, GstPad * pad, GstElement * fakesink)
{
  GstPad *sinkpad;

  sinkpad = gst_element_get_static_pad (fakesink, "sink");
  if (!gst_pad_is_linked (sinkpad)) {
    if (gst_pad_link (pad, sinkpad) != GST_PAD_LINK_OK)
      g_error ("Failed to link pads!");
  }
  gst_object_unref (sinkpad);
}

int
main (int argc, char ** argv)
{
  GstElement *pipe, *dec, *sink;
  GMainLoop *loop;
  GstBus *bus;

  gst_init (&argc, &argv);
  loop = g_main_loop_new (NULL, FALSE);

  if (argc < 2 || !gst_uri_is_valid (argv[1]))
    g_error ("Usage: %s file:///path/to/file", argv[0]);

  pipe = gst_pipeline_new ("pipeline");

  dec = gst_element_factory_make ("uridecodebin", NULL);
  g_object_set (dec, "uri", argv[1], NULL);
  gst_bin_add (GST_BIN (pipe), dec);

  sink = gst_element_factory_make ("fakesink", NULL);
  gst_bin_add (GST_BIN (pipe), sink);

  g_signal_connect (dec, "pad-added", G_CALLBACK (on_new_pad), sink);

/* we add a message handler */
  bus = gst_pipeline_get_bus (GST_PIPELINE (pipe));
  gst_bus_add_watch (bus, bus_call, loop);
  gst_object_unref (bus);


  gst_element_set_state (pipe, GST_STATE_PAUSED);

/*
  while (TRUE) {
    GstTagList *tags = NULL;

    msg = gst_bus_timed_pop_filtered (GST_ELEMENT_BUS (pipe),
        GST_CLOCK_TIME_NONE,
        GST_MESSAGE_ASYNC_DONE | GST_MESSAGE_TAG | GST_MESSAGE_ERROR);

    if (GST_MESSAGE_TYPE (msg) != GST_MESSAGE_TAG) // error or async_done
      break;

    gst_message_parse_tag (msg, &tags);

    g_print ("Got tags from element %s:\n", GST_OBJECT_NAME (msg->src));
    gst_tag_list_foreach (tags, print_one_tag, NULL);
    g_print ("\n");
    gst_tag_list_free (tags);

    gst_message_unref (msg);
  };

  if (GST_MESSAGE_TYPE (msg) == GST_MESSAGE_ERROR)
    g_error ("Got error");

  gst_message_unref (msg);
  */
  g_print ("Running...\n");
  g_main_loop_run (loop);

  gst_element_set_state (pipe, GST_STATE_NULL);
  gst_object_unref (pipe);
  return 0;
}
    